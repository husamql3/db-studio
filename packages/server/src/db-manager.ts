import type { ConnectionPool as MssqlPool } from "mssql";
import mssql from "mssql";
import type { Pool as MysqlPool } from "mysql2/promise";
import { createPool as createMysqlPool } from "mysql2/promise";
import { Pool, type PoolConfig } from "pg";
import type { DatabaseTypeSchema } from "shared/types";

/**
 * DatabaseManager - Manages multiple database connection pools for PostgreSQL, MySQL, and SQL Server
 */
class DatabaseManager {
	private pgPools: Map<string, Pool> = new Map();
	private mysqlPools: Map<string, MysqlPool> = new Map();
	private mssqlPools: Map<string, MssqlPool> = new Map();
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
		if (protocol === "postgres" || protocol === "postgresql") {
			return "pg";
		}
		if (protocol === "mysql" || protocol === "mysql2") {
			return "mysql";
		}
		if (protocol === "mssql" || protocol === "sqlserver") {
			return "mssql";
		}

		throw new Error(
			`Unsupported database type: ${protocol}. Supported types: PostgreSQL (postgres://), MySQL (mysql://), and SQL Server (mssql://).`,
		);
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
				url: databaseUrl,
				host: url.hostname,
				port:
					Number.parseInt(url.port, 10) ||
					(this.detectDbType(url) === "mysql"
						? 3306
						: this.detectDbType(url) === "mssql"
							? 1433
							: 5432),
				user: url.username,
				password: url.password,
				dbType: this.detectDbType(url),
			};
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : String(error));
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
	 */
	buildConnectionString(database?: string): string {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		if (!database) {
			const url = new URL(this.baseConfig.url);
			database = url.pathname.slice(1);
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
	 * Get or create a PostgreSQL connection pool for the specified database
	 */
	getPgPool(database?: string): Pool {
		const connectionString = this.buildConnectionString(database);

		if (!this.pgPools.has(connectionString)) {
			const poolConfig: PoolConfig = {
				connectionString,
				max: 10,
				idleTimeoutMillis: 30000,
				connectionTimeoutMillis: 2000,
			};

			const pool = new Pool(poolConfig);

			pool.on("error", (err) => {
				console.error(
					`Unexpected error on PostgreSQL pool for "${connectionString}":`,
					err.message,
				);
			});

			this.pgPools.set(connectionString, pool);
			console.log(`Created PostgreSQL connection pool for: ${connectionString}`);
		}

		return this.pgPools.get(connectionString) ?? new Pool({ connectionString });
	}

	/**
	 * Get or create a MySQL connection pool for the specified database
	 */
	getMysqlPool(database?: string): MysqlPool {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		const connectionString = this.buildConnectionString(database);

		if (!this.mysqlPools.has(connectionString)) {
			const url = new URL(connectionString);
			const dbName = url.pathname.slice(1);

			const pool = createMysqlPool({
				host: this.baseConfig.host,
				port: this.baseConfig.port,
				user: this.baseConfig.user,
				password: this.baseConfig.password,
				database: dbName || undefined,
				waitForConnections: true,
				connectionLimit: 10,
				idleTimeout: 30000,
				connectTimeout: 2000,
				// Enable multiple statements for raw query support
				multipleStatements: false,
			});

			this.mysqlPools.set(connectionString, pool);
			console.log(`Created MySQL connection pool for: ${connectionString}`);
		}

		return this.mysqlPools.get(connectionString) as MysqlPool;
	}

	/**
	 * Get or create a SQL Server connection pool for the specified database
	 */
	async getMssqlPool(database?: string): Promise<MssqlPool> {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		const connectionString = this.buildConnectionString(database);

		if (!this.mssqlPools.has(connectionString)) {
			const url = new URL(connectionString);
			const dbName = url.pathname.slice(1);

			const config: mssql.config = {
				server: this.baseConfig.host,
				port: this.baseConfig.port,
				user: this.baseConfig.user,
				password: this.baseConfig.password,
				database: dbName || undefined,
				options: {
					encrypt: false, // Use true for Azure
					trustServerCertificate: true,
					enableArithAbort: true,
					connectTimeout: 2000,
				},
				pool: {
					max: 10,
					min: 0,
					idleTimeoutMillis: 30000,
				},
			};

			const pool = await new mssql.ConnectionPool(config).connect();

			pool.on("error", (err) => {
				console.error(
					`Unexpected error on SQL Server pool for "${connectionString}":`,
					err.message,
				);
			});

			this.mssqlPools.set(connectionString, pool);
			console.log(`Created SQL Server connection pool for: ${connectionString}`);
		}

		return this.mssqlPools.get(connectionString) as MssqlPool;
	}

	/**
	 * Get the appropriate pool based on database type (legacy/PG-only helper)
	 */
	getPool(database?: string): Pool {
		return this.getPgPool(database);
	}

	/**
	 * Close a specific PostgreSQL pool by connection string
	 */
	async closePgPool(connectionString: string): Promise<void> {
		const pool = this.pgPools.get(connectionString);
		if (pool) {
			await pool.end();
			this.pgPools.delete(connectionString);
			console.log(`Closed PostgreSQL connection pool for: ${connectionString}`);
		}
	}

	/**
	 * Close a specific MySQL pool by connection string
	 */
	async closeMysqlPool(connectionString: string): Promise<void> {
		const pool = this.mysqlPools.get(connectionString);
		if (pool) {
			await pool.end();
			this.mysqlPools.delete(connectionString);
			console.log(`Closed MySQL connection pool for: ${connectionString}`);
		}
	}

	/**
	 * Close a specific SQL Server pool by connection string
	 */
	async closeMssqlPool(connectionString: string): Promise<void> {
		const pool = this.mssqlPools.get(connectionString);
		if (pool) {
			await pool.close();
			this.mssqlPools.delete(connectionString);
			console.log(`Closed SQL Server connection pool for: ${connectionString}`);
		}
	}

	/**
	 * Close a specific database pool by connection string (both types)
	 */
	async closePool(connectionString: string): Promise<void> {
		await this.closePgPool(connectionString);
		await this.closeMysqlPool(connectionString);
		await this.closeMssqlPool(connectionString);
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
		const pgClosePromises = Array.from(this.pgPools.entries()).map(
			async ([connectionString, pool]) => {
				await pool.end();
				console.log(`Closed PostgreSQL pool for: ${connectionString}`);
			},
		);
		const mysqlClosePromises = Array.from(this.mysqlPools.entries()).map(
			async ([connectionString, pool]) => {
				await pool.end();
				console.log(`Closed MySQL pool for: ${connectionString}`);
			},
		);
		const mssqlClosePromises = Array.from(this.mssqlPools.entries()).map(
			async ([connectionString, pool]) => {
				await pool.close();
				console.log(`Closed SQL Server pool for: ${connectionString}`);
			},
		);
		await Promise.all([...pgClosePromises, ...mysqlClosePromises, ...mssqlClosePromises]);
		this.pgPools.clear();
		this.mysqlPools.clear();
		this.mssqlPools.clear();
	}

	/**
	 * Get all active pool connection strings
	 */
	getActivePools(): string[] {
		return [
			...Array.from(this.pgPools.keys()),
			...Array.from(this.mysqlPools.keys()),
			...Array.from(this.mssqlPools.keys()),
		];
	}
}

// Singleton instance
const databaseManager = new DatabaseManager();

/**
 * Get a PostgreSQL pool for the specified database
 */
export const getDbPool = (database?: string): Pool => {
	return databaseManager.getPgPool(database);
};

/**
 * Get a MySQL pool for the specified database
 */
export const getMysqlPool = (database?: string): MysqlPool => {
	return databaseManager.getMysqlPool(database);
};

/**
 * Get a SQL Server pool for the specified database
 */
export const getMssqlPool = async (database?: string): Promise<MssqlPool> => {
	return databaseManager.getMssqlPool(database);
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
const _closeDbPoolByConnectionString = async (connectionString: string): Promise<void> => {
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
