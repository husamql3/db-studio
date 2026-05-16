import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import Database from "better-sqlite3";
import { Redis, type RedisOptions } from "ioredis";
import { MongoClient, ObjectId } from "mongodb";
import type { ConnectionPool as MssqlPool } from "mssql";
import mssql from "mssql";
import type { Pool as MysqlPool } from "mysql2/promise";
import { createPool as createMysqlPool } from "mysql2/promise";
import { Pool, type PoolConfig } from "pg";

/**
 * DatabaseManager - Manages multiple database connection pools for PostgreSQL, MySQL, SQL Server, and MongoDB
 */
class DatabaseManager {
	private pgPools: Map<string, Pool> = new Map();
	private mysqlPools: Map<string, MysqlPool> = new Map();
	private mssqlPools: Map<string, MssqlPool> = new Map();
	private mongoClient: MongoClient | null = null;
	private sqliteDb: Database.Database | null = null;
	private redisClients: Map<number, Redis> = new Map();
	private redisClusterChecked = false;
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
		switch (protocol) {
			case "postgres":
			case "postgresql":
				return "pg";
			case "mysql":
			case "mysql2":
				return "mysql";
			case "mssql":
			case "sqlserver":
				return "mssql";
			case "mongodb":
			case "mongodb+srv":
				return "mongodb";
			case "sqlite":
				return "sqlite";
			case "redis":
			case "rediss":
				return "redis";
			default:
				throw new Error(
					`Unsupported database type: ${protocol}. Supported types: PostgreSQL (postgres://), MySQL (mysql://), SQL Server (mssql://), MongoDB (mongodb://), SQLite (sqlite://), Redis (redis://).`,
				);
		}
	}

	/**
	 * Parse DATABASE_URL and extract connection details
	 */
	private initializeBaseConfig() {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set. Please provide a database connection string.");
		}

		// SQLite URLs use a file path that doesn't parse well as a standard URL
		if (databaseUrl.startsWith("sqlite://")) {
			this.baseConfig = {
				url: databaseUrl,
				host: "localhost",
				port: 0,
				user: "",
				password: "",
				dbType: "sqlite",
			};
			return;
		}

		try {
			const url = new URL(databaseUrl);
			const detectedType = this.detectDbType(url);
			const defaultPort =
				detectedType === "mysql"
					? 3306
					: detectedType === "mssql"
						? 1433
						: detectedType === "mongodb"
							? 27017
							: detectedType === "redis"
								? 6379
								: 5432;
			this.baseConfig = {
				url: databaseUrl,
				host: url.hostname,
				port: Number.parseInt(url.port, 10) || defaultPort,
				user: url.username,
				password: url.password,
				dbType: detectedType,
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

		// SQLite is a single-file database; the URL is already the full connection string
		if (this.baseConfig.dbType === "sqlite") {
			return this.baseConfig.url;
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
	 * Get or create the SQLite database connection
	 */
	getSqliteDb(): Database.Database {
		if (!this.baseConfig || this.baseConfig.dbType !== "sqlite") {
			throw new Error("DATABASE_URL is not a sqlite:// connection");
		}

		if (!this.sqliteDb) {
			// Strip "sqlite://" prefix to get the file path (e.g. sqlite:///path/db.sqlite → /path/db.sqlite)
			const filePath = this.baseConfig.url.replace(/^sqlite:\/\//, "");
			const db = new Database(filePath);
			db.pragma("journal_mode = WAL");
			db.pragma("foreign_keys = ON");
			this.sqliteDb = db;
			console.log(`Opened SQLite database: ${filePath}`);
		}

		return this.sqliteDb;
	}

	/**
	 * Close the SQLite database connection
	 */
	closeSqliteDb(): void {
		if (this.sqliteDb) {
			this.sqliteDb.close();
			this.sqliteDb = null;
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
		if (this.baseConfig?.dbType === "sqlite" && connectionString === this.baseConfig.url) {
			this.closeSqliteDb();
			return;
		}
		await this.closePgPool(connectionString);
		await this.closeMysqlPool(connectionString);
		await this.closeMssqlPool(connectionString);
	}

	/**
	 * Close a specific database pool by database name
	 */
	async closePoolByDatabase(database: string): Promise<void> {
		if (this.baseConfig?.dbType === "sqlite") {
			this.closeSqliteDb();
			return;
		}
		const connectionString = this.buildConnectionString(database);
		await this.closePool(connectionString);
	}

	/**
	 * Get or create a MongoDB client
	 */
	async getMongoClient(): Promise<MongoClient> {
		if (!this.mongoClient) {
			if (!this.baseConfig) {
				throw new Error("Base configuration not initialized");
			}
			const nextClient = new MongoClient(this.baseConfig.url);
			try {
				await nextClient.connect();
				this.mongoClient = nextClient;
			} catch (error) {
				try {
					await nextClient.close();
				} catch {
					// ignore close errors
				}
				throw error;
			}
		}
		return this.mongoClient;
	}

	/**
	 * Get the MongoDB database name from the connection URL
	 */
	getMongoDbName(): string {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}
		const path = new URL(this.baseConfig.url).pathname?.replace(/^\//, "");
		return path || "admin";
	}

	/**
	 * Get a MongoDB database instance
	 */
	async getMongoDb(dbName?: string) {
		const mongoClient = await this.getMongoClient();
		return mongoClient.db(dbName ?? this.getMongoDbName());
	}

	/**
	 * Get or create a Redis client for the specified logical DB index (0-15 by default)
	 */
	async getRedisClient(dbIndex?: number): Promise<Redis> {
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}
		if (this.baseConfig.dbType !== "redis") {
			throw new Error("DATABASE_URL is not a redis:// connection");
		}

		const index = dbIndex ?? this.getRedisDefaultDb();

		const existing = this.redisClients.get(index);
		if (existing) return existing;

		const url = new URL(this.baseConfig.url);
		const options: RedisOptions = {
			host: this.baseConfig.host,
			port: this.baseConfig.port,
			db: index,
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableReadyCheck: true,
			connectTimeout: 2000,
		};
		if (this.baseConfig.user) options.username = decodeURIComponent(this.baseConfig.user);
		if (this.baseConfig.password)
			options.password = decodeURIComponent(this.baseConfig.password);
		if (url.protocol === "rediss:") options.tls = {};

		const client = new Redis(options);
		try {
			await client.connect();
			if (!this.redisClusterChecked) {
				const info = await client.info("server");
				if (/^redis_mode:cluster\b/m.test(info)) {
					await client.quit().catch(() => {});
					throw new Error(
						"Redis cluster mode is not supported. Use a single-node redis:// connection.",
					);
				}
				this.redisClusterChecked = true;
			}
		} catch (error) {
			await client.quit().catch(() => {});
			throw error;
		}

		this.redisClients.set(index, client);
		console.log(`Created Redis client for db=${index}`);
		return client;
	}

	/**
	 * Get the default Redis logical DB from the URL (e.g. redis://host/3 → 3)
	 */
	getRedisDefaultDb(): number {
		if (!this.baseConfig) return 0;
		try {
			const url = new URL(this.baseConfig.url);
			const path = url.pathname.replace(/^\//, "");
			if (!path) return 0;
			const parsed = Number.parseInt(path, 10);
			return Number.isFinite(parsed) ? parsed : 0;
		} catch {
			return 0;
		}
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
		if (this.mongoClient) {
			await this.mongoClient.close();
			this.mongoClient = null;
		}
		this.closeSqliteDb();
		const redisClosePromises = Array.from(this.redisClients.entries()).map(
			async ([index, client]) => {
				await client.quit().catch(() => {});
				console.log(`Closed Redis client for db=${index}`);
			},
		);
		await Promise.all(redisClosePromises);
		this.redisClients.clear();
		this.redisClusterChecked = false;
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

/**
 * Get the SQLite database connection (single file, opened once)
 */
export const getSqliteDb = (): Database.Database => {
	return databaseManager.getSqliteDb();
};

/**
 * Get or create the MongoDB client
 */
export const getMongoClient = (): Promise<MongoClient> => {
	return databaseManager.getMongoClient();
};

/**
 * Get the MongoDB database name from the connection URL
 */
export const getMongoDbName = (): string => {
	return databaseManager.getMongoDbName();
};

/**
 * Get a MongoDB database instance
 */
export const getMongoDb = (dbName?: string) => {
	return databaseManager.getMongoDb(dbName);
};

/**
 * Get or create a Redis client for the specified logical DB index
 */
export const getRedisClient = (dbIndex?: number): Promise<Redis> => {
	return databaseManager.getRedisClient(dbIndex);
};

/**
 * Get the default Redis logical DB index from the connection URL
 */
export const getRedisDefaultDb = (): number => {
	return databaseManager.getRedisDefaultDb();
};

export const isValidObjectId = (value: unknown): value is string => {
	return typeof value === "string" && ObjectId.isValid(value);
};

export const coerceObjectId = (value: unknown): unknown => {
	if (typeof value === "string" && ObjectId.isValid(value)) {
		return new ObjectId(value);
	}
	return value;
};
