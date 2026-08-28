import type { DatabaseTypeSchema } from "@db-studio/shared/types";
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

const DATABASE_NAMES: Record<DatabaseTypeSchema, string> = {
	pg: "PostgreSQL",
	mysql: "MySQL",
	mssql: "SQL Server",
	mongodb: "MongoDB",
	sqlite: "SQLite",
	redis: "Redis",
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
	if (type === "sqlite") {
		return { type, name: DATABASE_NAMES[type], destination: "local file" };
	}

	const url = new URL(databaseUrl);
	const defaultPorts: Record<Exclude<DatabaseTypeSchema, "sqlite">, number> = {
		pg: 5432,
		mysql: 3306,
		mssql: 1433,
		mongodb: 27017,
		redis: 6379,
	};
	const port = Number.parseInt(url.port, 10) || defaultPorts[type];

	return { type, name: DATABASE_NAMES[type], destination: `${url.hostname}:${port}` };
};

export const checkDatabaseConnection = async (type: DatabaseTypeSchema): Promise<void> => {
	switch (type) {
		case "pg":
			await getDbPool().query("SELECT 1");
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
