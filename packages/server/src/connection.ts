import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import {
	type ConnectionSummarySchemaType,
	type ConnectionsStateSchemaType,
	dbTypeFromProtocol,
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
} from "@/connections-store.js";
import {
	DatabaseManager,
	getOpenConnection,
	openConnection,
	requestConnectionId,
} from "@/db-manager.js";
import { HTTPException } from "@/http-exception.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";

/**
 * Opening connections. A new URL is tested on its own clients before it joins the open ones;
 * the connections other browser tabs work with are never touched.
 */
let opening: Promise<unknown> = Promise.resolve();
/** Each open connection's URL as the user gave it, before driver aliases are rewritten. */
const openUrls = new Map<string, string>();

const FILE_URL = /^(?:sqlite|duckdb):\/\/(.+)$/;

const message = (error: unknown) =>
	sanitizeErrorMessage(error instanceof Error ? error.message : String(error));

/** Resolves to the id the opening tab sends back as `X-Connection-Id`. */
const open = async (url: string): Promise<string> => {
	// Already open: a second client on the same DuckDB file would fail to lock it.
	const existing = [...openUrls].find(([, open]) => open === url)?.[0];
	if (existing) return existing;
	let candidate: DatabaseManager;
	try {
		candidate = new DatabaseManager(url);
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
	openUrls.set(id, url);
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
	const run = opening.then(async () => {
		const file = url.match(FILE_URL)?.[1];
		if (requireExistingFile && file && file !== ":memory:") {
			await access(file).catch(() => {
				throw new HTTPException(400, { message: `No database file at ${file}` });
			});
		}
		const id = await open(url);
		await recordConnection(url).catch((error) => {
			// The connection works; only remembering it failed.
			writeOperationalLog("warn", "connection_save_failed", errorFields(error));
		});
		return id;
	});
	opening = run.catch(() => {});
	return run;
};

export const connectSaved = async (id: string) => {
	const saved = await findSavedConnection(id);
	return connect(saved.url, { requireExistingFile: true });
};

const toSummary = (saved: SavedConnection): ConnectionSummarySchemaType | null => {
	const dbType = dbTypeFromProtocol(saved.url.split("://")[0]?.toLowerCase() ?? "");
	if (!dbType) return null;
	const { id, name, color, lastUsedAt } = saved;
	return { id, name, color, lastUsedAt, dbType, maskedUrl: maskConnectionUrl(saved.url) };
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
	const url = connectionId && openUrls.get(connectionId);
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
