import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import type { ConnectionUrl } from "@/connection-url.js";
import { clickhouseConnector } from "./clickhouse.js";
import { duckdbConnector } from "./duckdb.js";
import { mongodbConnector } from "./mongodb.js";
import { mssqlConnector } from "./mssql.js";
import { mysqlConnector } from "./mysql.js";
import { oracleConnector } from "./oracle.js";
import { pgConnector } from "./pg.js";
import { redisConnector } from "./redis.js";
import { sqliteConnector } from "./sqlite.js";

/** The clients of one open connection: opened lazily, one per database where the engine has several. */
interface Connector {
	/** One trivial query through this connector's own clients. */
	ping(): Promise<void>;
	close(): Promise<void>;
}

export const CONNECTORS = {
	pg: pgConnector,
	mysql: mysqlConnector,
	mssql: mssqlConnector,
	mongodb: mongodbConnector,
	sqlite: sqliteConnector,
	redis: redisConnector,
	duckdb: duckdbConnector,
	oracle: oracleConnector,
	clickhouse: clickhouseConnector,
} satisfies {
	[T in DatabaseTypeSchema]: (url: ConnectionUrl, readOnly: boolean) => Connector;
};

export type ConnectorFor<T extends DatabaseTypeSchema> = ReturnType<(typeof CONNECTORS)[T]>;

export const STARTUP_TIMEOUT_MS = 10_000;

/** Pings `connector`, failing when the database does not answer within the startup timeout. */
export const checkConnection = async (connector: Connector): Promise<void> => {
	let timeout: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			connector.ping(),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Database startup check timed out")),
					STARTUP_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
};
