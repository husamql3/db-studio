import { Pool } from "pg";
import type { PoolConfig } from "pg";

/**
 * DatabaseManager - Manages multiple database connection pools
 * Allows switching between different databases on the same PostgreSQL server
 */
class DatabaseManager {
	private pools: Map<string, Pool> = new Map();
	private baseConfig: { host: string; port: number; user: string; password: string } | null = null;

	constructor() {
		this.initializeBaseConfig();
	}

	/**
	 * Parse DATABASE_URL and extract connection details
	 */
	private initializeBaseConfig() {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set. Please provide a database connection string.");
		}

		try {
			const url = new URL(databaseUrl);
			this.baseConfig = {
				host: url.hostname,
				port: Number.parseInt(url.port) || 5432,
				user: url.username,
				password: url.password,
			};
		} catch (error) {
			throw new Error(`Failed to parse DATABASE_URL: ${error}`);
		}
	}

	/**
	 * Build connection string for a specific database
	 */
	private buildConnectionString(database?: string): string {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		const { host, port, user, password } = this.baseConfig;
		
		// If no database specified, extract from original DATABASE_URL
		if (!database) {
			const databaseUrl = process.env.DATABASE_URL;
			if (databaseUrl) {
				const url = new URL(databaseUrl);
				database = url.pathname.slice(1); // Remove leading slash
			}
		}

		return `postgresql://${user}:${password}@${host}:${port}/${database}`;
	}

	/**
	 * Get or create a connection pool for the specified database
	 */
	getPool(database?: string): Pool {
		const dbName = database || this.getDefaultDatabase();
		
		if (!this.pools.has(dbName)) {
			const connectionString = this.buildConnectionString(dbName);
			const poolConfig: PoolConfig = {
				connectionString,
				max: 10, // Maximum number of clients in the pool
				idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
				connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
			};

			const pool = new Pool(poolConfig);

			// Handle pool errors
			pool.on("error", (err) => {
				console.error(`Unexpected error on database pool for "${dbName}":`, err.message);
			});

			this.pools.set(dbName, pool);
			console.log(`Created connection pool for database: ${dbName}`);
		}

		return this.pools.get(dbName)!;
	}

	/**
	 * Get the default database name from DATABASE_URL
	 */
	private getDefaultDatabase(): string {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set");
		}
		const url = new URL(databaseUrl);
		return url.pathname.slice(1); // Remove leading slash
	}

	/**
	 * Close a specific database pool
	 */
	async closePool(database: string): Promise<void> {
		const pool = this.pools.get(database);
		if (pool) {
			await pool.end();
			this.pools.delete(database);
			console.log(`Closed connection pool for database: ${database}`);
		}
	}

	/**
	 * Close all database pools
	 */
	async closeAll(): Promise<void> {
		const closePromises = Array.from(this.pools.entries()).map(async ([dbName, pool]) => {
			await pool.end();
			console.log(`Closed connection pool for database: ${dbName}`);
		});
		await Promise.all(closePromises);
		this.pools.clear();
	}

	/**
	 * Get all active pool database names
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
 * Close a specific database pool
 */
export const closeDbPool = async (database: string): Promise<void> => {
	return databaseManager.closePool(database);
};

/**
 * Close all database pools
 */
export const closeAllDbPools = async (): Promise<void> => {
	return databaseManager.closeAll();
};

/**
 * Get list of active pool database names
 */
export const getActivePools = (): string[] => {
	return databaseManager.getActivePools();
};

export default databaseManager;
