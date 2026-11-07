import type {
	AlterColumnParamsSchemaType,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteTableParams,
	FieldDataType,
	IndexInfoSchemaType,
	ServerLogLevel,
	ServerLogsResult,
} from "@db-studio/shared/types";
import type { FieldPacket, ResultSetHeader, RowDataPacket } from "mysql2";
import type { Connection, Pool as MysqlPool } from "mysql2/promise";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	type DriverErrorClass,
	probeOnce,
	READ_ONLY_MESSAGE,
} from "@/adapters/base.adapter.js";
import {
	logDetail,
	logsUnavailable,
	newestEntries,
	SERVER_LOGS_LIMIT,
	SERVER_LOGS_MARKER,
} from "@/adapters/server-logs.js";
import {
	fullForeignKeyName,
	flagOrJsonTarget,
	groupKeyColumns,
	SqlAdapter,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	buildMysqlColumnDefinition,
	mysqlFilters,
	mysqlKeyset,
	quoteMysqlIdent,
	mapMysqlToDataType,
	standardizeMysqlDataTypeLabel,
} from "./mysql.query-builder.js";

const MYSQL_FK_VIOLATION = 1451;
const MYSQL_FK_DEPENDENCY = 1217;
const MYSQL_DUP_KEYNAME = 1061;
const MYSQL_DROP_INDEX_FK = 1553;

/**
 * The column or name cannot be indexed: identifier too long (1059), key too long (1071),
 * engine cannot index the column (1167), TEXT/BLOB without a prefix length (1170),
 * bad index name (1280), JSON column (3152).
 */
const MYSQL_CANNOT_INDEX = new Set([1059, 1071, 1167, 1170, 1280, 3152]);
const MYSQL_TABLE_ACCESS_DENIED = 1142;
const MYSQL_NO_SUCH_TABLE = 1146;
const MYSQL_READ_ONLY = 1792;

/**
 * SQLSTATE class 22, a data exception (value out of range, too long, invalid JSON), is 400; class
 * 23, an integrity constraint violation (duplicate key, foreign key, NULL in a NOT NULL column),
 * is 409, as on PostgreSQL.
 */
const STATUS_BY_SQLSTATE_CLASS = new Map([
	["22", 400],
	["23", 409],
]);

/**
 * Errors MySQL files under the general SQLSTATE HY000: a CHECK constraint (3819) or a NOT NULL
 * column without a default (1364) is 409; a value the column type cannot hold (1366) or truncated
 * (1265) is 400.
 */
const STATUS_BY_ERRNO = new Map([
	[3819, 409],
	[1364, 409],
	[1366, 400],
	[1265, 400],
]);

/**
 * The server cannot be reached or refused the login: access denied (1045), cannot connect to
 * the local (2002) or remote (2003) server.
 */
const MYSQL_UNREACHABLE_ERRNOS = new Set([1045, 2002, 2003]);
const MYSQL_UNREACHABLE_CODES = new Set(["ER_ACCESS_DENIED_ERROR", "ER_BAD_HOST_ERROR"]);

const MYSQL_LOG_LEVELS: Record<string, ServerLogLevel> = {
	System: "info",
	Error: "error",
	Warning: "warning",
	Note: "info",
};

export class MySqlAdapter extends SqlAdapter<Connection> {
	private isMariaDb = probeOnce(async (pool: MysqlPool) => {
		const [rows] = await pool.query<RowDataPacket[]>(
			"SELECT VERSION() LIKE '%MariaDB%' AS mariadb",
		);

		return Number(rows[0]?.mariadb) === 1;
	});

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		const { code, errno, sqlState } = e as {
			code?: string;
			errno?: number;
			sqlState?: string;
		};

		if (errno === MYSQL_READ_ONLY) return { status: 403, message: READ_ONLY_MESSAGE };

		// Dropped, renamed, or a stale URL after switching databases.
		if (errno === MYSQL_NO_SUCH_TABLE) return { status: 404 };

		if (
			(errno !== undefined && MYSQL_UNREACHABLE_ERRNOS.has(errno)) ||
			(code !== undefined && MYSQL_UNREACHABLE_CODES.has(code))
		)
			return { status: 503 };

		const status =
			(errno !== undefined && STATUS_BY_ERRNO.get(errno)) ||
			STATUS_BY_SQLSTATE_CLASS.get(sqlState?.slice(0, 2) ?? "");

		return status ? { status } : undefined;
	}

	protected readonly quoteIdentifier = quoteMysqlIdent;
	protected readonly engine = "mysql";
	protected readonly placeholder = () => "?";

	protected async connect<T>(db: string, work: (conn: Connection) => Promise<T>) {
		return work(await connector("mysql").pool(db));
	}

	protected async rows<T>(conn: Connection, sql: string, values: unknown[] = []) {
		const [rows] = await conn.execute(sql, values as any);

		return rows as T[];
	}

	protected async execute(conn: Connection, sql: string, values: unknown[] = []) {
		const [result] = await conn.execute<ResultSetHeader>(sql, values as any);

		return result.affectedRows;
	}

	protected async transaction<T>(db: string, work: (conn: Connection) => Promise<T>) {
		const connection = await (await connector("mysql").pool(db)).getConnection();

		try {
			await connection.beginTransaction();
			const result = await work(connection);
			await connection.commit();

			return result;
		} catch (error) {
			await connection.rollback().catch(() => {});
			throw error;
		} finally {
			connection.release();
		}
	}

	protected isFkViolation(e: unknown) {
		return (e as { errno?: number }).errno === MYSQL_FK_VIOLATION;
	}

	protected override async writeTarget(_conn: Connection, db: string, tableName: string) {
		return flagOrJsonTarget(await this.getTableColumns({ tableName, db }));
	}

	override getTableData(params: GetTableDataParams) {
		return this.keysetTableData(params, { filters: mysqlFilters, keyset: mysqlKeyset });
	}

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const pool = await connector("mysql").pool();

		const [rows] = await pool.execute<RowDataPacket[]>(`
				SELECT
				  s.SCHEMA_NAME AS name,
				  CONCAT(ROUND(COALESCE(SUM(t.data_length + t.index_length), 0) / 1024 / 1024, 2), ' MB') AS size,
				  CURRENT_USER() AS owner,
				  s.DEFAULT_CHARACTER_SET_NAME AS encoding
				FROM information_schema.SCHEMATA s
				LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
				WHERE (s.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys') OR s.SCHEMA_NAME = DATABASE())
				GROUP BY s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME
				ORDER BY s.SCHEMA_NAME
			`);

		if (!rows[0])
			throw new HTTPException(500, { message: "No databases returned from server" });

		return rows as DatabaseInfoSchemaType[];
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await connector("mysql").pool();
		const [rows] = await pool.execute<RowDataPacket[]>("SELECT DATABASE() AS db");

		if (!rows[0])
			throw new HTTPException(500, { message: "No current database returned from server" });

		return (rows as Array<{ db: string }>)[0] as DatabaseSchemaType;
	}

	async getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		const pool = await connector("mysql").pool();

		const [infoRows] = await pool.execute<RowDataPacket[]>(`
			SELECT
			  VERSION()        AS version,
			  DATABASE()       AS database_name,
			  CURRENT_USER()   AS user,
			  @@hostname       AS host,
			  @@port           AS port,
			  @@max_connections AS max_connections
		`);

		const [connRows] = await pool.execute<RowDataPacket[]>(
			"SELECT COUNT(*) AS cnt FROM information_schema.PROCESSLIST",
		);

		if (!infoRows[0])
			throw new HTTPException(500, {
				message: "No connection information returned from server",
			});

		const info = (infoRows as Array<Record<string, string | number>>)[0];

		return {
			host: String(info.host || server.host),
			port: Number(info.port || server.port),
			user: String(info.user),
			database: String(info.database_name ?? ""),
			version: String(info.version),
			active_connections: Number((connRows as Array<{ cnt: number }>)[0]?.cnt ?? 0),
			max_connections: Number(info.max_connections),
		};
	}

	/** CREATE TABLE writes the key and UNIQUE as table constraints, ADD COLUMN in the column. */
	protected columnDefinition(
		_conn: Connection,
		_tableName: string,
		field: FieldDataType,
		createKey?: string[],
	) {
		return buildMysqlColumnDefinition(field, {
			includePrimaryKey: !createKey,
			includeUnique: !createKey,
		});
	}

	protected override readonly keysAsTableConstraints = true;

	protected override readonly foreignKeyName = fullForeignKeyName;

	protected override readonly tableOptions =
		" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

	protected override async dropTable(
		conn: Connection,
		{ tableName, db, cascade }: DeleteTableParams,
	) {
		if (!cascade) {
			await conn.execute(`DROP TABLE ${quoteMysqlIdent(tableName)}`);

			return;
		}

		const connection = await (await connector("mysql").pool(db)).getConnection();

		try {
			await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
			await connection.execute(`DROP TABLE ${quoteMysqlIdent(tableName)}`);
		} finally {
			// The session goes back to the pool, so it must check foreign keys again; one
			// that cannot be reset is closed instead.
			await connection.execute("SET FOREIGN_KEY_CHECKS = 1").then(
				() => connection.release(),
				(e: unknown) => {
					connection.destroy();
					throw e;
				},
			);
		}
	}

	protected override isDropRefused(e: unknown) {
		const { errno } = e as { errno?: number };

		return errno === MYSQL_FK_DEPENDENCY || errno === MYSQL_FK_VIOLATION;
	}

	protected override renameTableSql(tableName: string, newTableName: string) {
		return `RENAME TABLE ${quoteMysqlIdent(tableName)} TO ${quoteMysqlIdent(newTableName)}`;
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await connector("mysql").pool(db);

		await this.requireTable(pool, tableName);

		const [rows] = await pool.execute<RowDataPacket[]>(
			`SHOW CREATE TABLE ${quoteMysqlIdent(tableName)}`,
		);

		const row = (rows as Array<Record<string, string>>)[0];
		const createTableSql = row?.["Create Table"] ?? row?.create_table ?? "";

		if (!createTableSql) {
			throw new HTTPException(500, {
				message: `Failed to retrieve schema for table "${tableName}"`,
			});
		}

		return createTableSql;
	}

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = await connector("mysql").pool(db);

		// MariaDB stores JSON as LONGTEXT guarded by a json_valid() column check.
		const isJsonCheckedText = (await this.isMariaDb(pool))
			? `EXISTS (
			    SELECT 1 FROM information_schema.CHECK_CONSTRAINTS cc
			    WHERE cc.CONSTRAINT_SCHEMA = c.TABLE_SCHEMA
			      AND cc.TABLE_NAME = c.TABLE_NAME
			      AND cc.CHECK_CLAUSE = CONCAT('json_valid(\`', c.COLUMN_NAME, '\`)')
			  )`
			: "FALSE";

		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT
			  c.COLUMN_NAME            AS columnName,
			  c.DATA_TYPE              AS dataType,
			  c.COLUMN_TYPE            AS columnType,
			  ${isJsonCheckedText}     AS isJsonText,
			  (c.IS_NULLABLE = 'YES')  AS isNullable,
			  c.COLUMN_DEFAULT         AS columnDefault,
			  (c.COLUMN_KEY = 'PRI')   AS isPrimaryKey,
			  (kcu.REFERENCED_TABLE_NAME IS NOT NULL) AS isForeignKey,
			  kcu.REFERENCED_TABLE_NAME  AS referencedTable,
			  -- Tables of this database are listed without a schema: only another database's is named.
			  NULLIF(kcu.REFERENCED_TABLE_SCHEMA, DATABASE()) AS referencedSchema,
			  kcu.REFERENCED_COLUMN_NAME AS referencedColumn
			FROM information_schema.COLUMNS c
			LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
			  ON  c.TABLE_SCHEMA            = kcu.TABLE_SCHEMA
			  AND c.TABLE_NAME              = kcu.TABLE_NAME
			  AND c.COLUMN_NAME             = kcu.COLUMN_NAME
			  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
			WHERE c.TABLE_SCHEMA = DATABASE()
			  AND c.TABLE_NAME = ?
			ORDER BY c.ORDINAL_POSITION`,
			[tableName],
		);

		if (!rows || rows.length === 0) {
			throw this.tableMissing(tableName);
		}

		return (
			rows as Array<{
				columnName: string;
				dataType: string;
				columnType: string;
				isJsonText: number | boolean;
				isNullable: number | boolean;
				columnDefault: string | null;
				isPrimaryKey: number | boolean;
				isForeignKey: number | boolean;
				referencedTable: string | null;
				referencedSchema: string | null;
				referencedColumn: string | null;
			}>
		).map((r) => {
			const isEnum = r.dataType === "enum" || r.dataType === "set";

			const [dataType, columnType] = r.isJsonText
				? ["json", "json"]
				: [r.dataType, r.columnType];

			return {
				columnName: r.columnName,
				dataType: mapMysqlToDataType(dataType, columnType),
				dataTypeLabel: standardizeMysqlDataTypeLabel(dataType, columnType),
				isNullable: Boolean(r.isNullable),
				columnDefault: r.columnDefault ?? null,
				isPrimaryKey: Boolean(r.isPrimaryKey),
				isForeignKey: Boolean(r.isForeignKey),
				referencedTable: r.referencedTable ?? null,
				...(r.referencedSchema && { referencedSchema: r.referencedSchema }),
				referencedColumn: r.referencedColumn ?? null,
				enumValues: isEnum ? this.parseMysqlEnumValues(r.columnType) : null,
			};
		});
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = await connector("mysql").pool(db);

		await this.requireTable(pool, tableName);

		const [colRows] = await pool.execute<RowDataPacket[]>(
			`SELECT EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
			[tableName, columnName],
		);

		const colRow = (colRows as Array<{ EXTRA?: string | null }>)[0];

		if (!colRow) {
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		}

		const colDef = buildMysqlColumnDefinition(
			{ columnName, columnType, defaultValue, isNullable },
			{ preserveAutoIncrement: colRow.EXTRA?.toLowerCase().includes("auto_increment") },
		);

		await pool.execute<ResultSetHeader>(
			`ALTER TABLE ${quoteMysqlIdent(tableName)} MODIFY COLUMN ${colDef}`,
		);
	}

	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const pool = await connector("mysql").pool(db);

		try {
			// UNIX_TIMESTAMP reads LOGGED independently of the session time zone.
			const [rows] = await pool.query<RowDataPacket[]>(
				`${SERVER_LOGS_MARKER} SELECT UNIX_TIMESTAMP(LOGGED) AS epoch, THREAD_ID, PRIO,
					ERROR_CODE, SUBSYSTEM, DATA
				FROM performance_schema.error_log ORDER BY LOGGED DESC LIMIT ${SERVER_LOGS_LIMIT}`,
			);

			return {
				available: true,
				source: "performance_schema.error_log",
				entries: newestEntries(
					rows.reverse().map((row) => ({
						ts: new Date(Number(row.epoch) * 1000).toISOString(),
						level: MYSQL_LOG_LEVELS[row.PRIO as string] ?? "info",
						rawLevel: String(row.PRIO),
						source: row.SUBSYSTEM ? String(row.SUBSYSTEM) : undefined,
						code: row.ERROR_CODE ? String(row.ERROR_CODE) : undefined,
						message: String(row.DATA),
						detail: logDetail({ thread: row.THREAD_ID }),
					})),
				),
			};
		} catch (e) {
			const errno = (e as { errno?: number }).errno;

			if (errno === MYSQL_TABLE_ACCESS_DENIED) {
				return logsUnavailable(
					"Reading the server log needs: GRANT SELECT ON performance_schema.error_log TO <user>;",
				);
			}

			if (errno === MYSQL_NO_SUCH_TABLE) {
				return logsUnavailable(
					"The server keeps no error_log table. It needs MySQL 8.0.22 or later; MariaDB has no equivalent.",
				);
			}

			throw e;
		}
	}

	protected async runStatement(conn: Connection, statement: string) {
		const [result, fields] = (await conn.execute(statement)) as [
			RowDataPacket[] | ResultSetHeader,
			FieldPacket[],
		];

		if (!Array.isArray(result)) return { affected: result.affectedRows };

		return {
			columns: fields ? fields.map((f) => f.name) : Object.keys(result[0] ?? {}),
			rows: result as Record<string, unknown>[],
		};
	}

	/**
	 * InnoDB's row estimate for each base table of the database (or only `tableName`), in name
	 * order. MySQL 8 serves these from a cache refreshed once a day, so a table emptied this
	 * morning would still report its old size; the session reads them fresh instead. MariaDB and
	 * TiDB keep no such cache and reject the variable, which is harmless.
	 */
	protected async tableEstimates(
		_conn: Connection,
		db: string,
		tableName?: string,
	): Promise<TableEstimate[]> {
		const connection = await (await connector("mysql").pool(db)).getConnection();

		try {
			await connection
				.query("SET SESSION information_schema_stats_expiry = 0")
				.catch(() => {});

			const [rows] = await connection.query<RowDataPacket[]>(
				`SELECT table_name AS tableName, table_rows AS estimate
				FROM information_schema.tables
				WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
					${tableName === undefined ? "" : "AND table_name = ?"}
				ORDER BY table_name`,
				tableName === undefined ? [] : [tableName],
			);

			return (rows as Array<{ tableName: string; estimate: number | null }>).map((row) => ({
				tableName: row.tableName,
				estimate: Number(row.estimate ?? 0),
			}));
		} finally {
			connection.release();
		}
	}

	protected async primaryKey(pool: Connection, tableName: string): Promise<string[]> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COLUMN_NAME as column_name
			 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
			 ORDER BY ORDINAL_POSITION`,
			[tableName],
		);

		return (rows as Array<{ column_name: string }>).map((r) => r.column_name);
	}

	protected async referencingKeys(conn: Connection, tableName: string) {
		const rows = await this.rows<{
			constraintName: string;
			table: string;
			column: string;
			referencedColumn: string;
		}>(
			conn,
			`SELECT CONSTRAINT_NAME AS constraintName, TABLE_NAME AS \`table\`, COLUMN_NAME AS \`column\`,
				REFERENCED_COLUMN_NAME AS referencedColumn
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ?
			ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
			[tableName],
		);

		return groupKeyColumns(rows);
	}

	protected async columnNames(conn: Connection, tableName: string) {
		const rows = await this.rows<{ name: string }>(
			conn,
			"SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
			[tableName],
		);

		return rows.length ? rows.map((row) => row.name) : undefined;
	}

	protected override dropIndexSql(index: IndexInfoSchemaType, tableName: string) {
		return `DROP INDEX ${quoteMysqlIdent(index.indexName)} ON ${quoteMysqlIdent(tableName)}`;
	}

	protected override indexError(e: Error) {
		const { errno } = e as { errno?: number };

		if (errno === MYSQL_DUP_KEYNAME) return { status: 409 };

		if (
			errno === MYSQL_DROP_INDEX_FK ||
			(errno !== undefined && MYSQL_CANNOT_INDEX.has(errno))
		)
			return { status: 400 };

		return undefined;
	}

	protected async listIndexes(
		pool: Connection,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.requireTable(pool, tableName);

		// SELECT *, because EXPRESSION (a functional key part) exists only on MySQL 8.0.13+ and TiDB.
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
			[tableName],
		);

		const byName = new Map<
			string,
			{ index: IndexInfoSchemaType; parts: string[]; hasExpression: boolean }
		>();

		for (const row of rows) {
			const indexName = String(row.INDEX_NAME);

			const entry = byName.get(indexName) ?? {
				index: {
					indexName,
					columns: [],
					isUnique: Number(row.NON_UNIQUE) === 0,
					method: row.INDEX_TYPE ? String(row.INDEX_TYPE).toLowerCase() : null,
					kind:
						indexName === "PRIMARY"
							? "primary"
							: Number(row.NON_UNIQUE) === 0
								? "unique-constraint"
								: "index",
					definition: null,
				},
				parts: [],
				hasExpression: false,
			};

			byName.set(indexName, entry);

			const expression: string | null = row.EXPRESSION ?? null;

			if (row.COLUMN_NAME === null && expression !== null) {
				entry.index.columns.push(expression);
				entry.parts.push(`(${expression})${row.COLLATION === "D" ? " DESC" : ""}`);
				entry.hasExpression = true;
			} else {
				entry.index.columns.push(String(row.COLUMN_NAME));
				entry.parts.push(
					`${quoteMysqlIdent(String(row.COLUMN_NAME))}${row.SUB_PART === null ? "" : `(${row.SUB_PART})`}${row.COLLATION === "D" ? " DESC" : ""}`,
				);
			}
		}

		return [...byName.values()]
			.map(({ index, parts, hasExpression }) => ({
				...index,
				// MySQL has no stored CREATE INDEX text; this rebuilds it from the catalog rows.
				definition: !hasExpression
					? null
					: `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${quoteMysqlIdent(index.indexName)} ON ${quoteMysqlIdent(tableName)} (${parts.join(", ")})`,
			}))
			.sort(
				(a, b) =>
					Number(b.kind === "primary") - Number(a.kind === "primary") ||
					(a.indexName < b.indexName ? -1 : 1),
			);
	}

	private parseMysqlEnumValues(columnType: string): string[] | null {
		const match = columnType.match(/^(?:enum|set)\((.+)\)$/i);

		if (!match?.[1]) return null;

		return match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
	}
}
