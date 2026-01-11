import { getDbPool } from "../db-manager";

export interface DatabaseInfo {
	name: string;
	size: string;
	owner: string;
	encoding: string;
}

export interface DatabaseConnectionInfo {
	host: string;
	port: number;
	user: string;
	database: string;
	version: string;
	activeConnections: number;
	maxConnections: number;
}

export interface CurrentDatabase {
	database: string;
}

/**
 * Get list of all databases on the server
 */
export async function getDatabasesList(): Promise<DatabaseInfo[]> {
	const pool = getDbPool();
	const query = `
		SELECT 
			d.datname as name,
			pg_size_pretty(pg_database_size(d.datname)) as size,
			pg_catalog.pg_get_userbyid(d.datdba) as owner,
			pg_encoding_to_char(d.encoding) as encoding
		FROM pg_catalog.pg_database d
		WHERE d.datistemplate = false
		ORDER BY d.datname;
	`;

	const result = await pool.query(query);
	return result.rows;
}

/**
 * Get current database name
 */
export async function getCurrentDatabase(): Promise<CurrentDatabase> {
	const pool = getDbPool();
	const query = "SELECT current_database() as database;";
	const result = await pool.query(query);
	return result.rows[0];
}

/**
 * Get detailed connection information for current database
 */
export async function getDatabaseConnectionInfo(): Promise<DatabaseConnectionInfo> {
	const pool = getDbPool();

	// Get version and connection stats
	const infoQuery = `
		SELECT 
			version() as version,
			current_database() as database,
			current_user as user,
			inet_server_addr() as host,
			inet_server_port() as port,
			(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
			(SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections;
	`;

	const result = await pool.query(infoQuery);
	const row = result.rows[0];

	// Parse DATABASE_URL for host and port since inet_server_addr() might return null for local connections
	const databaseUrl = process.env.DATABASE_URL;
	let host = "localhost";
	let port = 5432;

	if (databaseUrl) {
		try {
			const url = new URL(databaseUrl);
			host = url.hostname;
			port = Number.parseInt(url.port, 10) || 5432;
		} catch (error) {
			console.error("Failed to parse DATABASE_URL:", error);
		}
	}

	return {
		host: row.host || host,
		port: row.port || port,
		user: row.user,
		database: row.database,
		version: row.version,
		activeConnections: Number.parseInt(row.active_connections, 10),
		maxConnections: Number.parseInt(row.max_connections, 10),
	};
}
