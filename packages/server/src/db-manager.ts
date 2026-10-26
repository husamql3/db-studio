import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClickHouseClient } from "@clickhouse/client";
import {
	DATABASE_ENGINES,
	type DatabaseTypeSchema,
	dbTypeFromProtocol,
} from "@db-studio/shared/types";
import type { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import type { Redis, RedisOptions } from "ioredis";
import type { MongoClient } from "mongodb";
import type { config as MssqlConfig, ConnectionPool as MssqlPool } from "mssql";
import type { Pool as MysqlPool } from "mysql2/promise";
import type { Pool as OraclePool } from "oracledb";
import type { Pool, PoolConfig } from "pg";
import { createD1Client, parseD1Url } from "@/d1-client.js";
import { loadDriver, loadedDriver } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";
import { currentConnectionId, errorFields, writeOperationalLog } from "@/operational-log.js";
import { fromLibsql, type SqliteClient } from "@/sqlite-client.js";
import { toDriverUrl } from "@/utils/parse-database-url.js";

/**
 * Decode a URL's username, password or path segment, which `URL` keeps percent-encoded
 * (`p%40ss` for `p@ss`). A `%` that starts no escape is kept as typed.
 */
const decodeUrlPart = (value: string): string => {
	try {
		return decodeURIComponent(value.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
	} catch {
		return value;
	}
};

/**
 * DatabaseManager - Manages multiple database connection pools for PostgreSQL, MySQL, SQL Server, Oracle, MongoDB, SQLite / libSQL, DuckDB and Redis
 */
export class DatabaseManager {
	private pgPools: Map<string, Pool> = new Map();
	private mysqlPools: Map<string, MysqlPool> = new Map();
	private mssqlPools: Map<string, MssqlPool> = new Map();
	private mongoClient: MongoClient | null = null;
	private sqliteClient: Promise<SqliteClient> | null = null;
	private duckdb: Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> | null =
		null;
	private duckdbQueue: Promise<unknown> = Promise.resolve();
	private oraclePool: Promise<OraclePool> | null = null;
	private redisClients: Map<number, Redis> = new Map();
	private redisClusterChecked = false;
	private clickhouseClients: Map<string, ClickHouseClient> = new Map();
	private readonly baseConfig: {
		url: string;
		host: string;
		port: number;
		user: string;
		password: string;
		dbType: DatabaseTypeSchema;
	} | null;

	/** Throws when `databaseUrl` is malformed or names an unsupported engine; connects lazily. */
	constructor(databaseUrl: string | null = null) {
		this.baseConfig = databaseUrl ? this.parseConfig(databaseUrl) : null;
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
	 * Parse a connection URL into connection details. Throws on an unsupported or malformed URL.
	 */
	private parseConfig(databaseUrl: string): NonNullable<DatabaseManager["baseConfig"]> {
		// File-based engines (sqlite://, duckdb://) carry a file path that doesn't parse well as a standard URL
		const fileDbType = dbTypeFromProtocol(databaseUrl.split("://")[0]);
		if (fileDbType && DATABASE_ENGINES[fileDbType].defaultPort === null) {
			return {
				url: databaseUrl,
				host: "localhost",
				port: 0,
				user: "",
				password: "",
				dbType: fileDbType,
			};
		}

		let driverUrl: string;
		let url: URL;
		try {
			driverUrl = toDriverUrl(databaseUrl);
			url = new URL(driverUrl);
		} catch {
			throw new Error("The connection URL is not a valid URL");
		}
		const detectedType = this.detectDbType(url);
		return {
			url: driverUrl,
			host: url.hostname,
			port: Number.parseInt(url.port, 10) || (DATABASE_ENGINES[detectedType].defaultPort ?? 0),
			user: decodeUrlPart(url.username),
			password: decodeUrlPart(url.password),
			dbType: detectedType,
		};
	}

	private config(): NonNullable<DatabaseManager["baseConfig"]> {
		if (!this.baseConfig) {
			throw new HTTPException(409, { message: "No database is connected" });
		}
		return this.baseConfig;
	}

	/**
	 * Get the detected database type
	 */
	getDbType(): DatabaseTypeSchema {
		return this.config().dbType;
	}

	/** The connection URL, with a wire-compatible alias rewritten to its driver's scheme */
	getConnectionUrl(): string {
		return this.config().url;
	}

	/**
	 * Build a connection string for the specified database
	 */
	buildConnectionString(database?: string): string {
		const config = this.config();

		// File-based databases: the URL is already the full connection string
		if (DATABASE_ENGINES[config.dbType].defaultPort === null) {
			return config.url;
		}

		try {
			const url = new URL(config.url);
			// The name is literal; encoded, the drivers decode it back (`sales%41` stays `sales%41`).
			if (database) url.pathname = `/${encodeURIComponent(database)}`;
			return url.toString();
		} catch (error) {
			throw new Error(
				`Failed to build connection string for database "${database}": ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get or create the client for a local SQLite file, a remote libSQL / Turso database or a
	 * Cloudflare D1 database
	 */
	getSqliteClient(): Promise<SqliteClient> {
		const { url, dbType } = this.config();
		if (dbType !== "sqlite") {
			throw new Error("The connection is not a sqlite://, libsql:// or d1:// connection");
		}
		this.sqliteClient ??= this.openSqliteClient(url).catch((error: unknown) => {
			this.sqliteClient = null;
			throw error;
		});
		return this.sqliteClient;
	}

	private async openSqliteClient(url: string): Promise<SqliteClient> {
		if (url.startsWith("d1://")) return createD1Client(parseD1Url(url));
		// sqlite:///abs/path.db (or a relative sqlite://./path.db) becomes a file: URL and
		// sqlite://:memory: stays in memory; libsql:// URLs keep their authToken and tls query params.
		const sqlitePath = url.startsWith("sqlite://") ? url.slice("sqlite://".length) : null;
		const libsqlUrl =
			sqlitePath === null
				? url
				: sqlitePath === ":memory:"
					? sqlitePath
					: pathToFileURL(resolve(sqlitePath)).href;
		const { createClient } = await loadDriver("sqlite");
		const client = createClient({ url: libsqlUrl, intMode: "bigint" });
		if (client.protocol === "file") {
			await client.execute("PRAGMA journal_mode = WAL");
			await client.execute("PRAGMA foreign_keys = ON");
		}
		return fromLibsql(client);
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
		const config = this.config();
		if (config.dbType !== "duckdb") {
			throw new Error("The connection is not a duckdb:// connection");
		}
		if (!this.duckdb) {
			const filePath = config.url.replace(/^duckdb:\/\//, "");
			this.duckdb = (async () => {
				try {
					// Checkpoint on every commit. DuckDB (1.4 and 1.5) cannot replay an ALTER TABLE on a
					// table with a nextval() default from the WAL, so a process that exits before the
					// next checkpoint leaves a file that no longer opens.
					const { DuckDBInstance } = await loadDriver("duckdb");
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
	getOraclePool(): Promise<OraclePool> {
		const { url, host, port, user, password, dbType } = this.config();
		if (dbType !== "oracle") {
			throw new Error("The connection is not an oracle:// connection");
		}
		const service = decodeURIComponent(new URL(url).pathname.slice(1));
		this.oraclePool ??= loadDriver("oracle")
			.then((oracledb) =>
				oracledb.createPool({
					user,
					password,
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
				}),
			)
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
	async getPgPool(database?: string): Promise<Pool> {
		const connectionString = this.buildConnectionString(database);
		const { Pool } = await loadDriver("pg");

		if (!this.pgPools.has(connectionString)) {
			const poolConfig: PoolConfig = {
				connectionString,
				max: 10,
				idleTimeoutMillis: 30000,
				// A serverless database waking from idle (Neon, Supabase) or a distant
				// region with TLS can take several seconds to accept a connection; at 2s
				// those users saw every request fail with CONNECT_TIMEOUT.
				connectionTimeoutMillis: 10_000,
			};

			// The tables list spans every user schema, but the SQL the adapters
			// build refers to tables by bare name, so a table outside "public" is
			// listed yet every query against it fails with "relation does not
			// exist". Widen search_path on each new connection.
			//
			// The pool awaits onConnect before handing the client out, so the
			// caller's first query cannot overlap the SET (pg deprecates queuing a
			// query on a busy client). "public" stays first so it keeps winning a
			// name collision, as before. A single set_config() rather than a DO
			// block, because CockroachDB does not run PL/pgSQL.
			const pool = new Pool({
				...poolConfig,
				onConnect: (client) =>
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
						.then(
							() => {},
							(err: Error) => {
								writeOperationalLog("warn", "db_search_path_widen_failed", {
									db_type: "pg",
									...errorFields(err),
								});
							},
						),
			});

			pool.on("error", (err) => {
				writeOperationalLog("error", "db_pool_error", { db_type: "pg", ...errorFields(err) });
			});

			this.pgPools.set(connectionString, pool);
		}

		return this.pgPools.get(connectionString) as Pool;
	}

	/**
	 * Get or create a MySQL connection pool for the specified database
	 */
	async getMysqlPool(database?: string): Promise<MysqlPool> {
		const config = this.config();
		const connectionString = this.buildConnectionString(database);
		const { createPool } = await loadDriver("mysql");

		if (!this.mysqlPools.has(connectionString)) {
			const url = new URL(connectionString);
			const dbName = decodeUrlPart(url.pathname.slice(1));

			const pool = createPool({
				host: config.host,
				port: config.port,
				user: config.user,
				password: config.password,
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
		const config = this.config();
		const connectionString = this.buildConnectionString(database);
		const mssql = await loadDriver("mssql");

		if (!this.mssqlPools.has(connectionString)) {
			const url = new URL(connectionString);
			const dbName = decodeUrlPart(url.pathname.slice(1));

			const poolConfig: MssqlConfig = {
				server: config.host,
				port: config.port,
				user: config.user,
				password: config.password,
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

			const pool = await new mssql.ConnectionPool(poolConfig).connect();

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
	async getClickhouseClient(database?: string): Promise<ClickHouseClient> {
		const config = this.config();
		const url = new URL(this.buildConnectionString(database));
		const dbName = decodeUrlPart(url.pathname.slice(1)) || "default";
		const { ClickHouseLogLevel, createClient } = await loadDriver("clickhouse");

		const existing = this.clickhouseClients.get(dbName);
		if (existing) return existing;

		const tls = url.protocol === "clickhouses:";
		const client = createClient({
			url: `${tls ? "https" : "http"}://${url.hostname}:${url.port || (tls ? 8443 : 8123)}`,
			username: config.user || "default",
			password: config.password,
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
	getPool(database?: string): Promise<Pool> {
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
			const { url } = this.config();
			const { MongoClient } = await loadDriver("mongodb");
			const nextClient = new MongoClient(url);
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
		return (
			decodeUrlPart(new URL(this.config().url).pathname.replace(/^\/+|\/+$/g, "")) || "admin"
		);
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
		const config = this.config();
		if (config.dbType !== "redis") {
			throw new Error("The connection is not a redis:// connection");
		}

		const index = dbIndex ?? this.getRedisDefaultDb();

		const existing = this.redisClients.get(index);
		if (existing) return existing;

		const url = new URL(config.url);
		const options: RedisOptions = {
			host: config.host,
			port: config.port,
			db: index,
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableReadyCheck: true,
			connectTimeout: 2000,
		};
		if (config.user) options.username = config.user;
		if (config.password) options.password = config.password;
		if (url.protocol === "rediss:") options.tls = {};

		const { Redis } = await loadDriver("redis");
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

/**
 * The open connections by id. Each browser tab names its own in `X-Connection-Id`, so two tabs
 * work with two databases at once.
 * shortcut: a connection stays open until the server stops, add idle eviction if users open many.
 */
const connections = new Map<string, DatabaseManager>();
/** Serves a request that names no connection: the CLI's `--database-url`, curl, scripts. */
let latestId: string | null = null;
const notConnected = new DatabaseManager();

/** Add `manager` as connection `id` and make it the latest. */
export const openConnection = (id: string, manager: DatabaseManager): void => {
	connections.set(id, manager);
	latestId = id;
};

export const getOpenConnection = (id: string) => connections.get(id);

/** Read once when a request arrives that names no connection; it keeps that one throughout. */
export const latestConnectionId = (): string | null => latestId;

/** The connection this request names when it is still open, else the latest. */
export const requestConnectionId = (): string | null => {
	const sent = currentConnectionId();
	return sent && connections.has(sent) ? sent : latestId;
};

// A request naming a connection that is gone reaches none, never another tab's database. Outside
// a request (CLI startup), the latest.
const current = (): DatabaseManager =>
	connections.get(currentConnectionId() ?? latestId ?? "") ?? notConnected;

/**
 * Get a PostgreSQL pool for the specified database
 */
export const getDbPool = (database?: string): Promise<Pool> => {
	return current().getPgPool(database);
};

/**
 * Get a MySQL pool for the specified database
 */
export const getMysqlPool = (database?: string): Promise<MysqlPool> => {
	return current().getMysqlPool(database);
};

/**
 * Get a SQL Server pool for the specified database
 */
export const getMssqlPool = async (database?: string): Promise<MssqlPool> => {
	return current().getMssqlPool(database);
};

/**
 * Get a ClickHouse client for the specified database
 */
export const getClickhouseClient = (database?: string): Promise<ClickHouseClient> => {
	return current().getClickhouseClient(database);
};

/**
 * Get the type of the connected database. Throws a 409 HTTPException when none is connected.
 */
export const getDbType = (): DatabaseTypeSchema => {
	return current().getDbType();
};

/**
 * Get the URL of the open connection. Throws a 409 HTTPException when none is connected.
 */
export const getConnectionUrl = (): string => {
	return current().getConnectionUrl();
};

/**
 * Build a connection string for the specified database
 */
const _buildDbConnectionString = (database?: string): string => {
	return current().buildConnectionString(database);
};

/**
 * Close a specific database pool by database name
 */
const _closeDbPool = async (database: string): Promise<void> => {
	return current().closePoolByDatabase(database);
};

/**
 * Close a specific database pool by connection string
 */
const _closeDbPoolByConnectionString = async (connectionString: string): Promise<void> => {
	return current().closePool(connectionString);
};

/**
 * Close all database pools
 */
export const closeAllDbPools = async (): Promise<void> => {
	await Promise.all([...connections.values()].map((manager) => manager.closeAll()));
};

/**
 * Get list of active pool connection strings
 */
const _getActivePools = (): string[] => {
	return current().getActivePools();
};

/**
 * Get the client for the configured SQLite file, libSQL / Turso or Cloudflare D1 database
 */
export const getSqliteClient = (): Promise<SqliteClient> => {
	return current().getSqliteClient();
};

/**
 * Run `fn` with the DuckDB connection (single file, opened once, calls serialized)
 */
export const withDuckdbConnection = <T>(
	fn: (connection: DuckDBConnection) => Promise<T>,
): Promise<T> => {
	return current().withDuckdbConnection(fn);
};

/**
 * Get or create the Oracle pool for the configured service
 */
export const getOraclePool = (): Promise<OraclePool> => {
	return current().getOraclePool();
};

/**
 * Get or create the MongoDB client
 */
export const getMongoClient = (): Promise<MongoClient> => {
	return current().getMongoClient();
};

/**
 * Get the MongoDB database name from the connection URL
 */
export const getMongoDbName = (): string => {
	return current().getMongoDbName();
};

/**
 * Get a MongoDB database instance
 */
export const getMongoDb = (dbName?: string) => {
	return current().getMongoDb(dbName);
};

/**
 * Get or create a Redis client for the specified logical DB index
 */
export const getRedisClient = (dbIndex?: number): Promise<Redis> => {
	return current().getRedisClient(dbIndex);
};

export const getIsolatedRedisClient = (dbIndex?: number): Promise<Redis> => {
	return current().getIsolatedRedisClient(dbIndex);
};

/**
 * Get the default Redis logical DB index from the connection URL
 */
export const getRedisDefaultDb = (): number => {
	return current().getRedisDefaultDb();
};

export const isValidObjectId = (value: unknown): value is string => {
	return typeof value === "string" && loadedDriver("mongodb").ObjectId.isValid(value);
};

export const coerceObjectId = (value: unknown): unknown => {
	const { ObjectId } = loadedDriver("mongodb");
	if (typeof value === "string" && ObjectId.isValid(value)) {
		return new ObjectId(value);
	}
	return value;
};
