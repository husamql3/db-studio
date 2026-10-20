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
import { getDbType, setConnectionUrl } from "@/db-manager.js";
import { HTTPException } from "@/http-exception.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";

/**
 * The one open connection: which URL the database layer uses, and switching it. A new URL is
 * tested before it replaces the current one; when the test fails the previous connection stays.
 */
let activeUrl: string | null = null;
let connectedAt = 0;
let switching: Promise<unknown> = Promise.resolve();

const FILE_URL = /^(?:sqlite|duckdb):\/\/(.+)$/;

const message = (error: unknown) =>
	sanitizeErrorMessage(error instanceof Error ? error.message : String(error));

const switchTo = async (url: string): Promise<void> => {
	const previous = activeUrl;
	try {
		await setConnectionUrl(url);
	} catch (error) {
		throw new HTTPException(400, { message: message(error), cause: error });
	}
	try {
		await checkDatabaseConnection(getDbType());
	} catch (error) {
		await setConnectionUrl(previous).catch(() => {});
		throw new HTTPException(400, {
			message: `Could not connect: ${message(error)}`,
			cause: error,
		});
	}
	activeUrl = url;
	connectedAt = Date.now();
};

/**
 * Test `rawUrl`, switch to it and save it. With `requireExistingFile`, a SQLite or DuckDB path
 * that does not exist is refused instead of created: a typo in the browser should not leave an
 * empty database file behind.
 */
export const connect = (
	rawUrl: string,
	{ requireExistingFile = false }: { requireExistingFile?: boolean } = {},
): Promise<SavedConnection | null> => {
	const url = normalizeConnectionUrl(rawUrl);
	const run = switching.then(async () => {
		const file = url.match(FILE_URL)?.[1];
		if (requireExistingFile && file && file !== ":memory:") {
			await access(file).catch(() => {
				throw new HTTPException(400, { message: `No database file at ${file}` });
			});
		}
		await switchTo(url);
		try {
			return await recordConnection(url);
		} catch (error) {
			// The connection works; only remembering it failed.
			writeOperationalLog("warn", "connection_save_failed", errorFields(error));
			return null;
		}
	});
	switching = run.catch(() => {});
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

export const getConnectionsState = async (): Promise<ConnectionsStateSchemaType> => {
	const saved = await listSavedConnections();
	const connections = saved
		.map(toSummary)
		.filter((summary) => summary !== null)
		.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
	const current = activeUrl;
	return {
		connections,
		active: current
			? {
					id:
						saved.find((c) => maskConnectionUrl(c.url) === maskConnectionUrl(current))?.id ??
						null,
					dbType: getDbType(),
					connectedAt,
				}
			: null,
	};
};

export const summarize = (saved: SavedConnection) => {
	const summary = toSummary(saved);
	if (!summary)
		throw new HTTPException(500, { message: "Saved connection has an unknown engine" });
	return summary;
};
