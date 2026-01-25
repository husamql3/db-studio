import { Pool, type PoolConfig } from "pg";
import type { DatabaseTypeSchema } from "shared/types";

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
		dbType: DatabaseTypeSchema;
	} | null = null;

	constructor() {
		this.initializeBaseConfig();
	}

	/**
	 * Detect database type from URL protocol
	 */
	private detectDbType(url: URL): DatabaseTypeSchema {
		const protocol = url.protocol.replace(":", "");
		// postgres:// or postgresql:// -> pg
		if (protocol === "postgres" || protocol === "postgresql") {
			return "pg";
		}
		// Default to pg for now, can be extended for mysql, sqlite, etc.
		return "pg";
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
				dbType: this.detectDbType(url),
			};
		} catch (error) {
			throw new Error(`Failed to parse DATABASE_URL: ${error}`);
		}
	}

	/**
	 * Get the detected database type
	 */
	getDbType(): DatabaseTypeSchema {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}
		return this.baseConfig.dbType;
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
 * Get the detected database type from DATABASE_URL
 */
export const getDbType = (): DatabaseTypeSchema => {
	return databaseManager.getDbType();
};

/**
 * Build a connection string for the specified database
 */
const _buildDbConnectionString = (database?: string): string => {
	return databaseManager.buildConnectionString(database);
};

/**
 * Close a specific database pool by database name
 */
const _closeDbPool = async (database: string): Promise<void> => {
	return databaseManager.closePoolByDatabase(database);
};

/**
 * Close a specific database pool by connection string
 */
const _closeDbPoolByConnectionString = async (
	connectionString: string,
): Promise<void> => {
	return databaseManager.closePool(connectionString);
};

/**
 * Close all database pools
 */
const _closeAllDbPools = async (): Promise<void> => {
	return databaseManager.closeAll();
};

/**
 * Get list of active pool connection strings
 */
const _getActivePools = (): string[] => {
	return databaseManager.getActivePools();
};
