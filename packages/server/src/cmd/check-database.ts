import { DATABASE_ENGINES, type DatabaseTypeSchema } from "@db-studio/shared/types";
import {
	getDbPool,
	getDbType,
	getMongoClient,
	getMongoDbName,
	getMssqlPool,
	getMysqlPool,
	getRedisClient,
	getSqliteDb,
} from "@/db-manager.js";
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
): DatabaseConnectionDetails => {
	const type = getDbType();
	const { label: name, defaultPort } = DATABASE_ENGINES[type];
	if (defaultPort === null) return { type, name, destination: "local file" };

	const { host, port } = parseDatabaseUrl(databaseUrl);
	return { type, name, destination: `${host}:${port}` };
};

export const checkDatabaseConnection = async (type: DatabaseTypeSchema): Promise<void> => {
	switch (type) {
		case "pg":
			await withStartupTimeout(getDbPool().query("SELECT 1"));
			return;
		case "mysql":
			await getMysqlPool().query("SELECT 1");
			return;
		case "mssql":
			await (await getMssqlPool()).request().query("SELECT 1");
			return;
		case "mongodb": {
			const client = await getMongoClient();
			await client.db(getMongoDbName()).command({ ping: 1 });
			return;
		}
		case "sqlite":
			getSqliteDb().prepare("SELECT 1").get();
			return;
		case "redis":
			await (await getRedisClient()).ping();
	}
};
