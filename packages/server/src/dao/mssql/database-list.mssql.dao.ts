import { HTTPException } from "hono/http-exception";
import type {
	ConnectionInfoSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
} from "shared/types";
import { getMssqlPool } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";

/**
 * Gets list of all databases on the SQL Server instance.
 * Returns name, size (human-readable), owner (connected user), and encoding (collation).
 */
export async function getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
	const pool = await getMssqlPool();

	const result = await pool.request().query(`
		SELECT
		  name AS name,
		  CAST(
		    ROUND(
		      CAST(SUM(size) * 8.0 / 1024 AS DECIMAL(10,2)),
		      2
		    ) AS VARCHAR(20)
		  ) + ' MB' AS size,
		  SUSER_SNAME(owner_sid) AS owner,
		  collation_name AS encoding
		FROM sys.databases
		WHERE database_id > 4  -- Exclude system databases
		GROUP BY name, owner_sid, collation_name
		ORDER BY name
	`);

	if (!result.recordset[0]) {
		throw new HTTPException(500, {
			message: "No databases returned from server",
		});
	}

	return result.recordset as DatabaseInfoSchemaType[];
}

/**
 * Gets the name of the database currently in use.
 */
export async function getCurrentDatabase(): Promise<DatabaseSchemaType> {
	const pool = await getMssqlPool();
	const result = await pool.request().query("SELECT DB_NAME() AS db");

	if (!result.recordset[0]) {
		throw new HTTPException(500, {
			message: "No current database returned from server",
		});
	}

	return result.recordset[0] as DatabaseSchemaType;
}

/**
 * Gets connection and server information for SQL Server.
 */
export async function getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
	const pool = await getMssqlPool();

	const result = await pool.request().query(`
		SELECT
		  @@VERSION AS version,
		  DB_NAME() AS database_name,
		  SUSER_NAME() AS [user],
		  @@SERVERNAME AS host,
		  (SELECT local_tcp_port FROM sys.dm_exec_connections WHERE session_id = @@SPID) AS port,
		  @@MAX_CONNECTIONS AS max_connections,
		  (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS active_connections
	`);

	if (!result.recordset[0]) {
		throw new HTTPException(500, {
			message: "No connection information returned from server",
		});
	}

	const info = result.recordset[0] as Record<string, string | number>;
	const urlDefaults = parseDatabaseUrl();

	return {
		host: String(info.host || urlDefaults.host),
		port: Number(info.port || urlDefaults.port),
		user: String(info.user),
		database: String(info.database_name ?? ""),
		version: String(info.version),
		active_connections: Number(info.active_connections ?? 0),
		max_connections: Number(info.max_connections),
	};
}
