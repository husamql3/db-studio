import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	type ClickHouseClient,
	ClickHouseLogLevel,
	createClient as createClickhouseClient,
} from "@clickhouse/client";
import {
	DATABASE_ENGINES,
	type DatabaseTypeSchema,
	dbTypeFromProtocol,
} from "@db-studio/shared/types";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import {
	createClient as createLibsqlClient,
	type Client as LibsqlClient,
} from "@libsql/client";
import { Redis, type RedisOptions } from "ioredis";
import { MongoClient, ObjectId } from "mongodb";
import type { ConnectionPool as MssqlPool } from "mssql";
import mssql from "mssql";
import type { Pool as MysqlPool } from "mysql2/promise";
import { createPool as createMysqlPool } from "mysql2/promise";
import oracledb from "oracledb";
import { Pool, type PoolConfig } from "pg";
import { errorFields, writeOperationalLog } from "@/operational-log.js";
import { toDriverUrl } from "@/utils/parse-database-url.js";

/**
 * DatabaseManager - Manages multiple database connection pools for PostgreSQL, MySQL, SQL Server, Oracle, MongoDB, SQLite / libSQL, DuckDB and Redis
 */
class DatabaseManager {
	private pgPools: Map<string, Pool> = new Map();
	private mysqlPools: Map<string, MysqlPool> = new Map();
	private mssqlPools: Map<string, MssqlPool> = new Map();
	private mongoClient: MongoClient | null = null;
	private sqliteClient: Promise<LibsqlClient> | null = null;
	private duckdb: Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> | null =
		null;
	private duckdbQueue: Promise<unknown> = Promise.resolve();
	private oraclePool: Promise<oracledb.Pool> | null = null;
	private redisClients: Map<number, Redis> = new Map();
	private redisClusterChecked = false;
	private clickhouseClients: Map<string, ClickHouseClient> = new Map();
	private baseConfig: {
		url: string;
		host: string;
		port: number;
		user: string;
		password: string;
		dbType: DatabaseTypeSchema;
	} | null = null;
	private initError: Error | null = null;

	constructor() {
		try {
			this.initializeBaseConfig();
		} catch (e) {
			this.initError = e instanceof Error ? e : new Error(String(e));
			writeOperationalLog("error", "db_config_invalid", errorFields(this.initError));
		}
	}

	/**
	 * Detect database type from URL protocol
	 */
	private detectDbType(url: URL): DatabaseTypeSchema {
		const protocol = url.protocol.replace(":", "");
		const dbType = dbTypeFromProtocol(protocol);
		if (dbType) return dbType;
		const supported = Object.values(DATABASE_ENGINES)
			.map(({ label, protocols }) => `${label} (${protocols.join(", ")})`)
			.join(", ");
		throw new Error(`Unsupported database type: ${protocol}. Supported types: ${supported}.`);
	}

	/**
	 * Parse DATABASE_URL and extract connection details
	 */
	private initializeBaseConfig() {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set. Please provide a database connection string.");
		}

		// File-based engines (sqlite://, duckdb://) carry a file path that doesn't parse well as a standard URL
		const fileDbType = dbTypeFromProtocol(databaseUrl.split("://")[0]);
		if (fileDbType && DATABASE_ENGINES[fileDbType].defaultPort === null) {
			this.baseConfig = {
				url: databaseUrl,
				host: "localhost",
				port: 0,
				user: "",
				password: "",
				dbType: fileDbType,
			};
			return;
		}

		try {
			const driverUrl = toDriverUrl(databaseUrl);
			const url = new URL(driverUrl);
			const detectedType = this.detectDbType(url);
			this.baseConfig = {
				url: driverUrl,
				host: url.hostname,
				port:
					Number.parseInt(url.port, 10) || (DATABASE_ENGINES[detectedType].defaultPort ?? 0),
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
		if (this.initError) throw this.initError;
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}
		return this.baseConfig.dbType;
	}

	/**
	 * Build a connection string for the specified database
	 */
	buildConnectionString(database?: string): string {
		if (this.initError) throw this.initError;
		if (!this.baseConfig) {
			throw new Error("Base configuration not initialized");
		}

		// File-based databases: the URL is already the full connection string
		if (DATABASE_ENGINES[this.baseConfig.dbType].defaultPort === null) {
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
	 * Get or create the libSQL client for a local SQLite file or a remote libSQL / Turso database
	 */
	getSqliteClient(): Promise<LibsqlClient> {
		if (!this.baseConfig || this.baseConfig.dbType !== "sqlite") {
			throw new Error("DATABASE_URL is not a sqlite:// or libsql:// connection");
		}
		const { url } = this.baseConfig;
		this.sqliteClient ??= this.openSqliteClient(url).catch((error: unknown) => {
			this.sqliteClient = null;
			throw error;
		});
		return this.sqliteClient;
	}

	private async openSqliteClient(url: string): Promise<LibsqlClient> {
		// sqlite:///abs/path.db (or a relative sqlite://./path.db) becomes a file: URL and
		// sqlite://:memory: stays in memory; libsql:// URLs keep their authToken and tls query params.
		const sqlitePath = url.startsWith("sqlite://") ? url.slice("sqlite://".length) : null;
		const libsqlUrl =
			sqlitePath === null
				? url
				: sqlitePath === ":memory:"
					? sqlitePath
					: pathToFileURL(resolve(sqlitePath)).href;
		const client = createLibsqlClient({ url: libsqlUrl, intMode: "bigint" });
		if (client.protocol === "file") {
			await client.execute("PRAGMA journal_mode = WAL");
			await client.execute("PRAGMA foreign_keys = ON");
		}
		return client;
	}

	/**
	 * Close the libSQL client
	 */
	async closeSqliteClient(): Promise<void> {
		const client = this.sqliteClient;
		this.sqliteClient = null;
		if (client) (await client.catch(() => null))?.close();
	}

	/**
	 * Run `fn` with the DuckDB connection, opening the file on first use. DuckDB holds one
	 * connection per file, so calls are serialized: a transaction opened inside `fn` cannot
	 * interleave with statements from a concurrent request.
	 */
	withDuckdbConnection<T>(fn: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
		const run = this.duckdbQueue.then(async () => fn((await this.openDuckdb()).connection));
		this.duckdbQueue = run.catch(() => {});
		return run;
	}

	private openDuckdb() {
		if (!this.baseConfig || this.baseConfig.dbType !== "duckdb") {
			throw new Error("DATABASE_URL is not a duckdb:// connection");
		}
		if (!this.duckdb) {
			const filePath = this.baseConfig.url.replace(/^duckdb:\/\//, "");
			this.duckdb = (async () => {
				try {
					// Checkpoint on every commit. DuckDB (1.4 and 1.5) cannot replay an ALTER TABLE on a
					// table with a nextval() default from the WAL, so a process that exits before the
					// next checkpoint leaves a file that no longer opens.
					const instance = await DuckDBInstance.create(filePath, {
						checkpoint_threshold: "0b",
					});
					return { instance, connection: await instance.connect() };
				} catch (e) {
					this.duckdb = null;
					const message = e instanceof Error ? e.message : String(e);
					if (message.includes("Could not set lock on file")) {
						throw new Error(
							`The DuckDB file "${filePath}" is locked by another process. Close the other program using it and try again. (${message})`,
						);
					}
					throw e;
				}
			})();
		}
		return this.duckdb;
	}

	async closeDuckdb(): Promise<void> {
		const open = this.duckdb;
		this.duckdb = null;
		const handle = await open?.catch(() => null);
		handle?.connection.closeSync();
		handle?.instance.closeSync();
	}

	/**
	 * Get or create the Oracle pool for the service in the URL (`oracle://user:pass@host:1521/SERVICE`).
	 * One pool per process: an Oracle service is a single database, so `db` never selects another pool.
	 */
	getOraclePool(): Promise<oracledb.Pool> {
		if (!this.baseConfig || this.baseConfig.dbType !== "oracle") {
			throw new Error("DATABASE_URL is not an oracle:// connection");
		}
		const { url, host, port, user, password } = this.baseConfig;
		const service = decodeURIComponent(new URL(url).pathname.slice(1));
		this.oraclePool ??= oracledb
			.createPool({
				user: decodeURIComponent(user),
				password: decodeURIComponent(password),
				connectString: `${host}:${port}/${service}`,
				poolMin: 0,
				poolMax: 10,
				connectTimeout: 5,
				// LTZ values are projected in the session zone; pin it so pooled connections agree.
				sessionCallback: (connection, _tag, done) => {
					connection
						.execute("ALTER SESSION SET TIME_ZONE = '+00:00'")
						.then(() =>
							connection.execute(
								`ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS' NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF9' NLS_TIMESTAMP_TZ_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM' NLS_NUMERIC_CHARACTERS = '.,'`,
							),
						)
						.then(() => done(), done);
				},
			})
			.catch((error: unknown) => {
				this.oraclePool = null;
				throw error;
			});
		return this.oraclePool;
	}

	async closeOraclePool(): Promise<void> {
		const pool = this.oraclePool;
		this.oraclePool = null;
		await (await pool?.catch(() => null))?.close(0);
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

			// The tables list spans every user schema, but the SQL the adapters
			// build refers to tables by bare name, so a table outside "public" is
			// listed yet every query against it fails with "relation does not
			// exist". Widen search_path on each new connection.
			//
			// pg emits "connect" synchronously and hands the client straight to
			// the caller, so this must enqueue in one shot: awaiting a lookup
			// first would let the caller's query jump ahead of the SET. "public"
			// stays first so it keeps winning a name collision, as before. A
			// single set_config() rather than a DO block, because CockroachDB
			// does not run PL/pgSQL.
			pool.on("connect", (client) => {
				client
					.query(
						`SELECT set_config(
							'search_path',
							COALESCE(
								'public, ' || string_agg(quote_ident(nspname), ', ' ORDER BY nspname),
								current_setting('search_path')
							),
							false
						)
						FROM pg_namespace
						WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'crdb_internal', 'pg_extension')
							AND nspname NOT LIKE 'pg_toast%'
							AND nspname NOT LIKE 'pg_temp%';`,
					)
					.catch((err: Error) => {
						writeOperationalLog("warn", "db_search_path_widen_failed", {
							db_type: "pg",
							...errorFields(err),
						});
					});
			});

			pool.on("error", (err) => {
				writeOperationalLog("error", "db_pool_error", { db_type: "pg", ...errorFields(err) });
			});

			this.pgPools.set(connectionString, pool);
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
				writeOperationalLog("error", "db_pool_error", {
					db_type: "mssql",
					...errorFields(err),
				});
			});

			this.mssqlPools.set(connectionString, pool);
		}

		return this.mssqlPools.get(connectionString) as MssqlPool;
	}

	/**
	 * Get or create a ClickHouse HTTP client for the specified database.
	 * `clickhouse://` maps to http, `clickhouses://` to https (default port 8443).
	 */
	getClickhouseClient(database?: string): ClickHouseClient {
		const url = new URL(this.buildConnectionString(database));
		const dbName = decodeURIComponent(url.pathname.slice(1)) || "default";

		const existing = this.clickhouseClients.get(dbName);
		if (existing) return existing;

		const tls = url.protocol === "clickhouses:";
		const client = createClickhouseClient({
			url: `${tls ? "https" : "http"}://${url.hostname}:${url.port || (tls ? 8443 : 8123)}`,
			username: decodeURIComponent(url.username) || "default",
			password: decodeURIComponent(url.password),
			database: dbName,
			request_timeout: 30_000,
			clickhouse_settings: {
				output_format_json_quote_64bit_integers: 1,
				output_format_json_quote_decimals: 1,
				wait_end_of_query: 1,
			},
			// Failures surface through the adapter's error mapping; the client's own log would duplicate them.
			log: { level: ClickHouseLogLevel.OFF },
		});
		this.clickhouseClients.set(dbName, client);
		return client;
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
			writeOperationalLog("info", "db_pool_closed", { db_type: "pg" });
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
			writeOperationalLog("info", "db_pool_closed", { db_type: "mysql" });
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
			writeOperationalLog("info", "db_pool_closed", { db_type: "mssql" });
		}
	}

	/**
	 * Close a specific database pool by connection string (both types)
	 */
	async closePool(connectionString: string): Promise<void> {
		if (this.baseConfig?.dbType === "sqlite" && connectionString === this.baseConfig.url) {
			await this.closeSqliteClient();
			return;
		}
		if (this.baseConfig?.dbType === "duckdb" && connectionString === this.baseConfig.url) {
			await this.closeDuckdb();
			return;
		}
		if (this.baseConfig?.dbType === "oracle") {
			await this.closeOraclePool();
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
			await this.closeSqliteClient();
			return;
		}
		if (this.baseConfig?.dbType === "duckdb") {
			await this.closeDuckdb();
			return;
		}
		if (this.baseConfig?.dbType === "oracle") {
			await this.closeOraclePool();
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
		const raw = new URL(this.baseConfig.url).pathname.replace(/^\/+|\/+$/g, "");
		try {
			return decodeURIComponent(raw) || "admin";
		} catch {
			// Malformed percent-encoding — fall back to the literal path segment.
			return raw || "admin";
		}
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
				if (/^redis_mode:(cluster|sentinel)\b/m.test(info)) {
					await client.quit().catch(() => {});
					throw new Error(
						"Redis cluster and Sentinel modes are not supported. Use a standalone redis:// connection.",
					);
				}
				const version = info.match(/^redis_version:([^\r\n]+)/m)?.[1];
				const [major = 0, minor = 0] = version?.split(".").map(Number) ?? [];
				if (major < 6 || (major === 6 && minor < 2)) {
					await client.quit().catch(() => {});
					throw new Error(
						`Redis 6.2 or newer is required. Connected server reports ${version ?? "an unknown version"}.`,
					);
				}
				this.redisClusterChecked = true;
			}
		} catch (error) {
			await client.quit().catch(() => {});
			throw error;
		}

		this.redisClients.set(index, client);
		return client;
	}

	async getIsolatedRedisClient(dbIndex?: number): Promise<Redis> {
		const client = (await this.getRedisClient(dbIndex)).duplicate();
		await client.connect();
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
		const pgClosePromises = Array.from(this.pgPools.values()).map(async (pool) => {
			await pool.end();
			writeOperationalLog("info", "db_pool_closed", { db_type: "pg" });
		});
		const mysqlClosePromises = Array.from(this.mysqlPools.values()).map(async (pool) => {
			await pool.end();
			writeOperationalLog("info", "db_pool_closed", { db_type: "mysql" });
		});
		const mssqlClosePromises = Array.from(this.mssqlPools.values()).map(async (pool) => {
			await pool.close();
			writeOperationalLog("info", "db_pool_closed", { db_type: "mssql" });
		});
		await Promise.all([...pgClosePromises, ...mysqlClosePromises, ...mssqlClosePromises]);
		this.pgPools.clear();
		this.mysqlPools.clear();
		this.mssqlPools.clear();
		if (this.mongoClient) {
			await this.mongoClient.close();
			this.mongoClient = null;
		}
		await this.closeSqliteClient();
		await this.closeDuckdb();
		await this.closeOraclePool();
		const redisClosePromises = Array.from(this.redisClients.values()).map(async (client) => {
			await client.quit().catch(() => {});
			writeOperationalLog("info", "db_pool_closed", { db_type: "redis" });
		});
		await Promise.all(redisClosePromises);
		this.redisClients.clear();
		this.redisClusterChecked = false;
		await Promise.all(
			Array.from(this.clickhouseClients.values()).map((client) => client.close()),
		);
		this.clickhouseClients.clear();
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
 * Get a ClickHouse client for the specified database
 */
export const getClickhouseClient = (database?: string): ClickHouseClient => {
	return databaseManager.getClickhouseClient(database);
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
 * Get the libSQL client for the configured SQLite file or libSQL / Turso database
 */
export const getSqliteClient = (): Promise<LibsqlClient> => {
	return databaseManager.getSqliteClient();
};

/**
 * Run `fn` with the DuckDB connection (single file, opened once, calls serialized)
 */
export const withDuckdbConnection = <T>(
	fn: (connection: DuckDBConnection) => Promise<T>,
): Promise<T> => {
	return databaseManager.withDuckdbConnection(fn);
};

/**
 * Get or create the Oracle pool for the configured service
 */
export const getOraclePool = (): Promise<oracledb.Pool> => {
	return databaseManager.getOraclePool();
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

export const getIsolatedRedisClient = (dbIndex?: number): Promise<Redis> => {
	return databaseManager.getIsolatedRedisClient(dbIndex);
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
