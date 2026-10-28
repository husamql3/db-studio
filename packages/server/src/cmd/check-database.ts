import {
	DATABASE_ENGINES,
	type DatabaseTypeSchema,
	dbTypeFromProtocol,
} from "@db-studio/shared/types";
import type { DatabaseManager } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";

const STARTUP_TIMEOUT_MS = 2_000;

const withStartupTimeout = async <T>(operation: Promise<T>): Promise<T> => {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Database startup check timed out")),
					STARTUP_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
};

export type DatabaseConnectionDetails = {
	type: DatabaseTypeSchema;
	name: string;
	destination: string;
};

export const getDatabaseConnectionDetails = (
	databaseUrl: string,
): DatabaseConnectionDetails | null => {
	const type = dbTypeFromProtocol(databaseUrl.split("://")[0]?.toLowerCase() ?? "");
	if (!type) return null;
	const { label: name, defaultPort } = DATABASE_ENGINES[type];
	if (databaseUrl.startsWith("sqlite://")) return { type, name, destination: "local file" };
	if (databaseUrl.startsWith("d1://")) return { type, name, destination: "Cloudflare D1" };

	if (defaultPort === null) return { type, name, destination: new URL(databaseUrl).host };

	const { host, port } = parseDatabaseUrl(databaseUrl);
	return { type, name, destination: `${host}:${port}` };
};

/** Run one trivial query through `manager`'s own clients. */
export const checkDatabaseConnection = async (manager: DatabaseManager): Promise<void> => {
	switch (manager.getDbType()) {
		case "pg":
			await withStartupTimeout(manager.getPgPool().then((pool) => pool.query("SELECT 1")));
			return;
		case "mysql":
			await (await manager.getMysqlPool()).query("SELECT 1");
			return;
		case "mssql":
			await (await manager.getMssqlPool()).request().query("SELECT 1");
			return;
		case "mongodb": {
			const client = await manager.getMongoClient();
			await client.db(manager.getMongoDbName()).command({ ping: 1 });
			return;
		}
		case "sqlite":
			await withStartupTimeout(
				manager.getSqliteClient().then((client) => client.execute("SELECT 1")),
			);
			return;
		case "redis":
			await (await manager.getRedisClient()).ping();
			return;
		case "duckdb":
			await manager.withDuckdbConnection((connection) => connection.run("SELECT 1"));
			return;
		case "oracle": {
			const connection = await (await manager.getOraclePool()).getConnection();
			await connection.execute("SELECT 1 FROM dual").finally(() => connection.close());
			return;
		}

		case "clickhouse":
			await withStartupTimeout(
				manager.getClickhouseClient().then((client) => client.query({ query: "SELECT 1" })),
			);
	}
};
