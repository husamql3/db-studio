import { HTTPException } from "hono/http-exception";
import type { RowDataPacket } from "mysql2";
import type {
	ConnectionInfoSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
} from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";

/**
 * Gets list of all databases (schemas) on the MySQL server.
 * Returns name, size (human-readable), owner (connected user), and encoding (charset).
 */
export async function getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
	const pool = getMysqlPool();

	const [rows] = await pool.execute<RowDataPacket[]>(`
		SELECT
		  s.SCHEMA_NAME AS name,
		  CONCAT(
		    ROUND(
		      COALESCE(SUM(t.data_length + t.index_length), 0) / 1024 / 1024,
		      2
		    ),
		    ' MB'
		  ) AS size,
		  CURRENT_USER() AS owner,
		  s.DEFAULT_CHARACTER_SET_NAME AS encoding
		FROM information_schema.SCHEMATA s
		LEFT JOIN information_schema.TABLES t
		  ON t.TABLE_SCHEMA = s.SCHEMA_NAME
		GROUP BY s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME
		ORDER BY s.SCHEMA_NAME
	`);

	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No databases returned from server",
		});
	}

	return rows as DatabaseInfoSchemaType[];
}

/**
 * Gets the name of the database currently in use.
 */
export async function getCurrentDatabase(): Promise<DatabaseSchemaType> {
	const pool = getMysqlPool();
	const [rows] = await pool.execute<RowDataPacket[]>("SELECT DATABASE() AS db");

	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No current database returned from server",
		});
	}

	return (rows as Array<{ db: string }>)[0] as DatabaseSchemaType;
}

/**
 * Gets connection and server information for MySQL.
 */
export async function getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
	const pool = getMysqlPool();

	const [infoRows] = await pool.execute<RowDataPacket[]>(`
		SELECT
		  VERSION()     AS version,
		  DATABASE()    AS database_name,
		  CURRENT_USER() AS user,
		  @@hostname    AS host,
		  @@port        AS port,
		  @@max_connections AS max_connections
	`);

	const [connRows] = await pool.execute<RowDataPacket[]>(
		"SELECT COUNT(*) AS cnt FROM information_schema.PROCESSLIST",
	);

	if (!infoRows[0]) {
		throw new HTTPException(500, {
			message: "No connection information returned from server",
		});
	}

	const info = (infoRows as Array<Record<string, string | number>>)[0];
	const activeConnections = Number((connRows as Array<{ cnt: number }>)[0]?.cnt ?? 0);

	const urlDefaults = parseDatabaseUrl();

	return {
		host: String(info.host || urlDefaults.host),
		port: Number(info.port || urlDefaults.port),
		user: String(info.user),
		database: String(info.database_name ?? ""),
		version: String(info.version),
		active_connections: activeConnections,
		max_connections: Number(info.max_connections),
	};
}
