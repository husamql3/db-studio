import { DATABASE_ENGINES, type DatabaseTypeSchema } from "@db-studio/shared/types";
import { type ConnectionUrl, parseConnectionUrl } from "@/connection-url.js";
import { CONNECTORS, type ConnectorFor } from "@/connectors/index.js";
import { HTTPException } from "@/http-exception.js";
import { currentConnectionId } from "@/operational-log.js";

export type OpenConnection = {
	[T in DatabaseTypeSchema]: {
		dbType: T;
		/** The URL as the user gave it, before an alias is rewritten for its driver. */
		url: string;
		parsed: ConnectionUrl;
		readOnly: boolean;
		connector: ConnectorFor<T>;
	};
}[DatabaseTypeSchema];

/**
 * Throws when `url` is malformed or names an unsupported engine, or when `readOnly` is set for
 * an engine that cannot open a read-only session; its clients connect on first use.
 */
export const createConnection = (url: string, readOnly = false): OpenConnection => {
	const parsed = parseConnectionUrl(url);
	const engine = DATABASE_ENGINES[parsed.dbType];

	if (readOnly && !engine.readOnly) {
		throw new Error(`${engine.label} connections cannot be opened read-only`);
	}

	// SAFETY: CONNECTORS maps each engine to its own connector, so the pair stays matched.
	return {
		dbType: parsed.dbType,
		url,
		parsed,
		readOnly,
		connector: CONNECTORS[parsed.dbType](parsed, readOnly),
	} as OpenConnection;
};

/**
 * The open connections by id. Each browser tab names its own in `X-Connection-Id`, so two tabs
 * work with two databases at once.
 * shortcut: a connection stays open until the server stops, add idle eviction if users open many.
 */
const connections = new Map<string, OpenConnection>();

/** Serves a request that names no connection: the CLI's `--database-url`, curl, scripts. */
let latestId: string | null = null;

/** Closed while this server runs: a tab naming one is told it is gone, not handed the latest. */
const closedIds = new Set<string>();

/** Add `connection` as connection `id` and make it the latest. */
export const registerConnection = (id: string, connection: OpenConnection): void => {
	connections.set(id, connection);
	latestId = id;
};

/** Close connection `id`; requests that name it get 409 from then on. */
export const closeConnection = async (id: string): Promise<void> => {
	const connection = connections.get(id);
	connections.delete(id);
	closedIds.add(id);

	if (latestId === id) latestId = null;
	await connection?.connector.close();
};

export const closeAllConnections = async (): Promise<void> => {
	await Promise.all([...connections.values()].map(({ connector }) => connector.close()));
};

export const getOpenConnection = (id: string) => connections.get(id);

export const listOpenConnections = () => [...connections];

/** Read once when a request arrives that names no connection; it keeps that one throughout. */
export const latestConnectionId = (): string | null => latestId;

/**
 * The connection this request names when it is still open; none when this server closed it; else
 * (a new tab, or an id from before a restart) the latest.
 */
export const requestConnectionId = (): string | null => {
	const sent = currentConnectionId();

	if (sent && closedIds.has(sent)) return null;

	return sent && connections.has(sent) ? sent : latestId;
};

/**
 * The connection this request reaches: the one it named, or the latest when it arrived. A request
 * naming a connection that is gone reaches none, never another tab's database. Outside a request
 * (CLI startup, scripts), the latest.
 */
export const requestConnection = (): OpenConnection => {
	const connection = connections.get(currentConnectionId() ?? latestId ?? "");

	if (!connection) throw new HTTPException(409, { message: "No database is connected" });

	return connection;
};

/** The clients of this request's connection; adapters reach their database only through it. */
export const connector = <T extends DatabaseTypeSchema>(dbType: T): ConnectorFor<T> => {
	const connection = requestConnection();

	if (connection.dbType !== dbType) {
		throw new Error(`The connection is not a ${DATABASE_ENGINES[dbType].label} connection`);
	}

	// SAFETY: the check above proves the connection's engine is `T`.
	return connection.connector as ConnectorFor<T>;
};
