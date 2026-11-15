import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import {
	type ConnectionSummarySchemaType,
	type ConnectionsStateSchemaType,
	type UpdateConnectionSchemaType,
} from "@db-studio/shared/types";
import { normalizeConnectionUrl, parseConnectionUrl, urlDbType } from "@/connection-url.js";
import {
	findSavedConnection,
	listSavedConnections,
	maskConnectionUrl,
	recordConnection,
	type SavedConnection,
	sameConnection,
	updateSavedConnection,
} from "@/connections-store.js";
import { checkConnection } from "@/connectors/index.js";
import { HTTPException } from "@/http-exception.js";
import {
	assertCanOpenReadOnly,
	closeConnection,
	createConnection,
	getOpenConnection,
	listOpenConnections,
	type OpenConnection,
	registerConnection,
	requestConnectionId,
} from "@/open-connections.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";
import { sanitizeErrorMessage } from "@/sanitize-error.js";

/**
 * Opening connections and switching their mode, one at a time: an open that read the old mode must
 * not register after the switch closed that mode's connections. A new URL is tested on its own
 * clients before it joins the open ones; the connections other browser tabs work with are never touched.
 */
let opening: Promise<unknown> = Promise.resolve();

const queued = <T>(run: () => Promise<T>): Promise<T> => {
	const result = opening.then(run);
	opening = result.catch(() => {});

	return result;
};

const message = (error: unknown) =>
	sanitizeErrorMessage(error instanceof Error ? error.message : String(error));

/** Already open: a second client on the same DuckDB file would fail to lock it. */
const reuseOpen = (url: string, readOnly: boolean) =>
	listOpenConnections().find(
		([, open]) => open.url === url && open.readOnly === readOnly,
	)?.[0];

/** Tests `candidate` on its own clients, then opens it; resolves to the id the tab sends back. */
const open = async (candidate: OpenConnection): Promise<string> => {
	try {
		await checkConnection(candidate.connector);
	} catch (error) {
		await candidate.connector.close().catch(() => {});
		throw new HTTPException(400, {
			message: `Could not connect: ${message(error)}`,
			cause: error,
		});
	}

	const id = randomUUID();
	registerConnection(id, candidate);

	return id;
};

/**
 * Test `rawUrl`, open it and save it; resolves to its connection id. With `requireExistingFile`,
 * a SQLite or DuckDB path that does not exist is refused instead of created: a typo in the
 * browser should not leave an empty database file behind.
 */
export const connect = (
	rawUrl: string,
	{ requireExistingFile = false }: { requireExistingFile?: boolean } = {},
): Promise<string> => {
	const url = normalizeConnectionUrl(rawUrl);

	return queued(async () => {
		// A pasted URL of a read-only saved connection opens read-only too.
		const readOnly = (await listSavedConnections()).some(
			(c) => c.readOnly && sameConnection(c.url, url),
		);

		let candidate: OpenConnection;

		try {
			candidate = createConnection(url, readOnly);
		} catch (error) {
			throw new HTTPException(400, { message: message(error), cause: error });
		}

		const { file, inMemory } = candidate.parsed;

		if (requireExistingFile && file && !inMemory) {
			await access(file).catch(() => {
				throw new HTTPException(400, { message: `No database file at ${file}` });
			});
		}

		const id = reuseOpen(url, readOnly) ?? (await open(candidate));
		await recordConnection(url).catch((error) => {
			// The connection works; only remembering it failed.
			writeOperationalLog("warn", "connection_save_failed", errorFields(error));
		});

		return id;
	});
};

export const connectSaved = async (id: string) => {
	const saved = await findSavedConnection(id);

	return connect(saved.url, { requireExistingFile: true });
};

const toSummary = (saved: SavedConnection): ConnectionSummarySchemaType | null => {
	const dbType = urlDbType(saved.url);

	if (!dbType) return null;
	const { id, name, color, readOnly, lastUsedAt } = saved;

	return {
		id,
		name,
		color,
		readOnly,
		lastUsedAt,
		dbType,
		maskedUrl: maskConnectionUrl(saved.url),
	};
};

/** The saved connections and the open one `connectionId` names: by default, the requesting tab's. */
export const getConnectionsState = async (
	connectionId = requestConnectionId(),
): Promise<ConnectionsStateSchemaType> => {
	const saved = await listSavedConnections();

	const connections = saved
		.map(toSummary)
		.filter((summary) => summary !== null)
		.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

	const open = connectionId && getOpenConnection(connectionId);

	if (!connectionId || !open) return { connections, active: null };

	return {
		connections,
		active: {
			id: saved.find((c) => sameConnection(c.url, open.url))?.id ?? null,
			dbType: open.dbType,
			connectionId,
		},
	};
};

const summarize = (saved: SavedConnection) => {
	const summary = toSummary(saved);

	if (!summary)
		throw new HTTPException(500, { message: "Saved connection has an unknown engine" });

	return summary;
};

/**
 * Rename, recolor or switch read-only. A connection open in the old mode closes, in every tab: its
 * pools were opened read-write or read-only, so the tab reconnects to change mode.
 */
export const updateConnection = (id: string, change: UpdateConnectionSchemaType) =>
	queued(async () => {
		const found = await findSavedConnection(id);
		// Refuses a saved URL of an unknown engine before anything is changed.
		summarize(found);

		if (change.readOnly) assertCanOpenReadOnly(parseConnectionUrl(found.url));

		const updated = await updateSavedConnection(id, change);

		for (const [connectionId, open] of listOpenConnections()) {
			if (open.readOnly !== updated.readOnly && sameConnection(open.url, updated.url)) {
				await closeConnection(connectionId);
			}
		}

		return summarize(updated);
	});
