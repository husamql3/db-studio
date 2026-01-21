import { HTTPException } from "hono/http-exception";
import {
	type ConnectionQueryResult,
	connectionInfoSchema,
	type DatabaseInfoType,
	type DatabaseSchemaType,
	databaseInfoSchema,
	databaseSchema,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";

/**
 * Gets list of all normal databases on the PostgreSQL server.
 * Returns name, size (human readable), owner, and encoding.
 *
 * @returns List of database information objects
 * @throws Error if query fails or no databases are found
 */
export async function getDatabasesList(): Promise<DatabaseInfoType[]> {
	const pool = getDbPool();
	const query = `
    SELECT 
      d.datname                          as name,
      pg_size_pretty(pg_database_size(d.datname)) as size,
      pg_catalog.pg_get_userbyid(d.datdba)        as owner,
      pg_encoding_to_char(d.encoding)             as encoding
    FROM pg_catalog.pg_database d
    WHERE d.datistemplate = false
    ORDER BY d.datname;
  `;

	const { rows } = await pool.query(query);
	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No databases returned from database",
		});
	}

	return databaseInfoSchema.array().parse(rows);
}

/**
 * Gets the name of the database we are currently using.
 *
 * @returns Object with current database name
 * @throws Error if query fails or no name is returned
 */
export async function getCurrentDatabase(): Promise<DatabaseSchemaType> {
	const pool = getDbPool();
	const query = "SELECT current_database() as database;";

	const { rows } = await pool.query(query);
	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No current database returned from database",
		});
	}

	return databaseSchema.parse(rows[0]);
}

/**
 * Gets useful information about the connection and PostgreSQL server.
 * Includes version, host, port, user, database name, active connections, etc.
 *
 * Uses fallback values from DATABASE_URL if some fields are missing.
 *
 * @returns Connection and server information object
 * @throws Error if query fails or result is invalid
 */
export async function getDatabaseConnectionInfo(): Promise<ConnectionQueryResult> {
	const pool = getDbPool();
	const query = `
    SELECT 
      version() as version,
      current_database() as database,
      current_user as user,
      inet_server_addr() as host,
      inet_server_port() as port,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
      (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections;
  `;

	const { rows } = await pool.query(query);
	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No connection information returned from database",
		});
	}

	// Validate main result
	const result = connectionInfoSchema.parse(rows[0]);

	// Use DATABASE_URL as backup for host/port if needed
	const urlDefaults = parseDatabaseUrl();

	return connectionInfoSchema.parse({
		host: result.host || urlDefaults.host,
		port: result.port ? result.port.toString() : null,
		user: result.user,
		database: result.database,
		version: result.version.toString(),
		active_connections: result.active_connections,
		max_connections: result.max_connections,
	});
}
