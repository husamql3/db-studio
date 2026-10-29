import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import {
	type ConnectionSummarySchemaType,
	type ConnectionsStateSchemaType,
	DATABASE_ENGINES,
	dbTypeFromProtocol,
	type UpdateConnectionSchemaType,
} from "@db-studio/shared/types";
import { checkDatabaseConnection } from "@/cmd/check-database.js";
import { sanitizeErrorMessage } from "@/cmd/sanitize-error.js";
import {
	findSavedConnection,
	listSavedConnections,
	maskConnectionUrl,
	normalizeConnectionUrl,
	recordConnection,
	type SavedConnection,
	updateSavedConnection,
} from "@/connections-store.js";
import {
	closeConnection,
	DatabaseManager,
	getOpenConnection,
	openConnection,
	requestConnectionId,
} from "@/db-manager.js";
import { HTTPException } from "@/http-exception.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";

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
/** Each open connection's URL as the user gave it, before driver aliases are rewritten. */
const openUrls = new Map<string, { url: string; readOnly: boolean }>();

const FILE_URL = /^(?:sqlite|duckdb):\/\/(.+)$/;

const message = (error: unknown) =>
	sanitizeErrorMessage(error instanceof Error ? error.message : String(error));

/** Resolves to the id the opening tab sends back as `X-Connection-Id`. */
const open = async (url: string, readOnly: boolean): Promise<string> => {
	// Already open: a second client on the same DuckDB file would fail to lock it.
	const existing = [...openUrls].find(
		([, open]) => open.url === url && open.readOnly === readOnly,
	)?.[0];
	if (existing) return existing;
	let candidate: DatabaseManager;
	try {
		candidate = new DatabaseManager(url, readOnly);
	} catch (error) {
		throw new HTTPException(400, { message: message(error), cause: error });
	}
	try {
		await checkDatabaseConnection(candidate);
	} catch (error) {
		await candidate.closeAll().catch(() => {});
		throw new HTTPException(400, {
			message: `Could not connect: ${message(error)}`,
			cause: error,
		});
	}
	const id = randomUUID();
	openConnection(id, candidate);
	openUrls.set(id, { url, readOnly });
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
		const file = url.match(FILE_URL)?.[1];
		if (requireExistingFile && file && file !== ":memory:") {
			await access(file).catch(() => {
				throw new HTTPException(400, { message: `No database file at ${file}` });
			});
		}
		// A pasted URL of a read-only saved connection opens read-only too.
		const readOnly = (await listSavedConnections()).some(
			(c) => c.readOnly && maskConnectionUrl(c.url) === maskConnectionUrl(url),
		);
		const id = await open(url, readOnly);
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
	const dbType = dbTypeFromProtocol(saved.url.split("://")[0]?.toLowerCase() ?? "");
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
	const url = connectionId && openUrls.get(connectionId)?.url;
	const manager = connectionId && getOpenConnection(connectionId);
	if (!connectionId || !url || !manager) return { connections, active: null };
	return {
		connections,
		active: {
			id: saved.find((c) => maskConnectionUrl(c.url) === maskConnectionUrl(url))?.id ?? null,
			dbType: manager.getDbType(),
			connectionId,
		},
	};
};

export const summarize = (saved: SavedConnection) => {
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
		const saved = summarize(found);
		if (change.readOnly && !DATABASE_ENGINES[saved.dbType].readOnly) {
			throw new HTTPException(400, {
				message: `${DATABASE_ENGINES[saved.dbType].label} connections cannot be opened read-only`,
			});
		}
		// Closing its only instance would delete its data, and DuckDB cannot reopen memory read-only.
		if (change.readOnly && found.url.match(FILE_URL)?.[1] === ":memory:") {
			throw new HTTPException(400, {
				message: "An in-memory database cannot be opened read-only",
			});
		}
		const updated = await updateSavedConnection(id, change);
		for (const [connectionId, open] of openUrls) {
			if (
				open.readOnly !== updated.readOnly &&
				maskConnectionUrl(open.url) === maskConnectionUrl(updated.url)
			) {
				openUrls.delete(connectionId);
				await closeConnection(connectionId);
			}
		}
		return summarize(updated);
	});
