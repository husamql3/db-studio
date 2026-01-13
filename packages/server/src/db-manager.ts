import type { PoolConfig } from "pg";
import { Pool } from "pg";

/**
 * DatabaseManager - Manages multiple database connection pools
 * Allows switching between different databases on the same PostgreSQL server
 */
class DatabaseManager {
	private pools: Map<string, Pool> = new Map();
	private baseConfig: {
		url: string;
		host: string;
		port: number;
		user: string;
		password: string;
	} | null = null;

	constructor() {
		this.initializeBaseConfig();
	}

	/**
	 * Parse DATABASE_URL and extract connection details
	 */
	private initializeBaseConfig() {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error(
				"DATABASE_URL is not set. Please provide a database connection string.",
			);
		}

		try {
			const url = new URL(databaseUrl);
			this.baseConfig = {
				url: databaseUrl,
				host: url.hostname,
				port: Number.parseInt(url.port, 10) || 5432,
				user: url.username,
				password: url.password,
			};
		} catch (error) {
			throw new Error(`Failed to parse DATABASE_URL: ${error}`);
		}
	}

	/**
	 * Build a connection string for the specified database
	 * @param database - The database name (optional, defaults to database from DATABASE_URL)
	 * @returns The connection string for the specified database
	 * @throws Error if database is invalid or unknown
	 */
	buildConnectionString(database?: string): string {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		// If no database specified, extract from original DATABASE_URL
		if (!database) {
			const databaseUrl = this.baseConfig.url;
			if (databaseUrl) {
				const url = new URL(databaseUrl);
				database = url.pathname.slice(1); // Remove leading slash
			}
		}

		// if (!database || database.trim() === "") {
		// 	throw new Error("Database name is required and cannot be empty");
		// }

		// Validate database name format (PostgreSQL identifiers)
		// Database names cannot contain special characters that would break URL parsing
		// if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(database)) {
		// 	throw new Error(
		// 		`Invalid database name: "${database}". Database names must start with a letter or underscore and contain only alphanumeric characters, underscores, or dollar signs.`,
		// 	);
		// }

		try {
			const url = new URL(this.baseConfig.url);
			url.pathname = `/${database}`;
			return url.toString();
		} catch (error) {
			throw new Error(
				`Failed to build connection string for database "${database}": ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get or create a connection pool for the specified database
	 * Pools are cached by connection string to ensure distinct connections per database
	 */
	getPool(database?: string): Pool {
		// Build connection string first to validate the database
		const connectionString = this.buildConnectionString(database);

		// Use connection string as the cache key
		if (!this.pools.has(connectionString)) {
			const poolConfig: PoolConfig = {
				connectionString,
				max: 10, // Maximum number of clients in the pool
				idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
				connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
			};

			const pool = new Pool(poolConfig);

			// Handle pool errors
			pool.on("error", (err) => {
				console.error(
					`Unexpected error on database pool for "${connectionString}":`,
					err.message,
				);
			});

			this.pools.set(connectionString, pool);
			console.log(`Created connection pool for: ${connectionString}`);
		}

		return this.pools.get(connectionString) ?? new Pool({ connectionString });
	}

	/**
	 * Close a specific database pool by connection string
	 */
	async closePool(connectionString: string): Promise<void> {
		const pool = this.pools.get(connectionString);
		if (pool) {
			await pool.end();
			this.pools.delete(connectionString);
			console.log(`Closed connection pool for: ${connectionString}`);
		}
	}

	/**
	 * Close a specific database pool by database name
	 */
	async closePoolByDatabase(database: string): Promise<void> {
		const connectionString = this.buildConnectionString(database);
		await this.closePool(connectionString);
	}

	/**
	 * Close all database pools
	 */
	async closeAll(): Promise<void> {
		const closePromises = Array.from(this.pools.entries()).map(
			async ([connectionString, pool]) => {
				await pool.end();
				console.log(`Closed connection pool for: ${connectionString}`);
			},
		);
		await Promise.all(closePromises);
		this.pools.clear();
	}

	/**
	 * Get all active pool connection strings
	 */
	getActivePools(): string[] {
		return Array.from(this.pools.keys());
	}
}

// Singleton instance
const databaseManager = new DatabaseManager();

/**
 * Get a database pool for the specified database
 * If no database is specified, returns the default database pool
 */
export const getDbPool = (database?: string): Pool => {
	return databaseManager.getPool(database);
};

/**
 * Build a connection string for the specified database
 */
export const buildDbConnectionString = (database?: string): string => {
	return databaseManager.buildConnectionString(database);
};

/**
 * Close a specific database pool by database name
 */
export const closeDbPool = async (database: string): Promise<void> => {
	return databaseManager.closePoolByDatabase(database);
};

/**
 * Close a specific database pool by connection string
 */
export const closeDbPoolByConnectionString = async (
	connectionString: string,
): Promise<void> => {
	return databaseManager.closePool(connectionString);
};

/**
 * Close all database pools
 */
export const closeAllDbPools = async (): Promise<void> => {
	return databaseManager.closeAll();
};

/**
 * Get list of active pool connection strings
 */
export const getActivePools = (): string[] => {
	return databaseManager.getActivePools();
};

export default databaseManager;
