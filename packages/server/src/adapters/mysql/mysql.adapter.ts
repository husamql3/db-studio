import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateIndexParamsSchemaType,
	CreateTableSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	DropIndexParamsSchemaType,
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogLevel,
	ServerLogsResult,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapMysqlToDataType, standardizeMysqlDataTypeLabel } from "@db-studio/shared/types";
import type { FieldPacket, ResultSetHeader, RowDataPacket } from "mysql2";
import type { Connection, Pool as MysqlPool } from "mysql2/promise";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	type DriverErrorClass,
	EXACT_COUNT_LIMIT,
	READ_ONLY_MESSAGE,
} from "@/adapters/base.adapter.js";
import { decodeCursor } from "@/adapters/cursor.js";
import {
	logDetail,
	logsUnavailable,
	newestEntries,
	SERVER_LOGS_LIMIT,
	SERVER_LOGS_MARKER,
} from "@/adapters/server-logs.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import {
	sqlCursorSchema,
	keysetOrderBy,
	keysetPage,
	keysetPredicate,
	orderTerms,
} from "@/adapters/sql-pagination.js";
import { groupKeyColumns, SqlAdapter } from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	buildMysqlColumnDefinition,
	mysqlFilters,
	mysqlKeyset,
	quoteMysqlIdent,
} from "./mysql.query-builder.js";

const MYSQL_FK_VIOLATION = 1451;
const MYSQL_FK_DEPENDENCY = 1217;
const MYSQL_DUP_KEYNAME = 1061;
const MYSQL_DUP_ENTRY = 1062;
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
	// Keyed by pool: tabs can work with a MySQL and a MariaDB server at once.
	private mariaDb = new WeakMap<MysqlPool, Promise<boolean>>();

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		const { code, errno } = e as { code?: string; errno?: number };

		if (errno === MYSQL_READ_ONLY) return { status: 403, message: READ_ONLY_MESSAGE };

		if (
			(errno !== undefined && MYSQL_UNREACHABLE_ERRNOS.has(errno)) ||
			(code !== undefined && MYSQL_UNREACHABLE_CODES.has(code))
		)
			return { status: 503 };

		return undefined;
	}

	protected readonly quoteIdentifier = quoteMysqlIdent;
	protected readonly placeholder = () => "?";

	protected async connect<T>(db: string, work: (conn: Connection) => Promise<T>) {
		return work(await connector("mysql").pool(db));
	}

	protected async rows<T>(conn: Connection, sql: string, values: unknown[] = []) {
		const [rows] = await conn.execute(sql, values as any);

		return rows as T[];
	}

	override async getTableData(params: GetTableDataParams) {
		const {
			tableName,
			db,
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			cursor,
			filters = [],
		} = params;

		const pool = await connector("mysql").pool(db);
		const { values, bind } = createBinds(() => "?");
		const filterConditions = buildFilterConditions(filters, bind, mysqlFilters);

		// The first queries to touch the table, so a dropped table or a stale URL fails here.
		const [pkColumns, { total, estimated }] = await Promise.all([
			this.getPrimaryKeyColumns(pool, tableName),
			this.countRows(pool, tableName, whereSql(filterConditions), [...values]),
		]).catch((e: unknown) => {
			if ((e as { errno?: number }).errno === MYSQL_NO_SUCH_TABLE)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
			throw e;
		});

		const terms = orderTerms(sort, order, pkColumns);
		const backward = direction === "desc";
		const cursorValues = cursor ? decodeCursor(cursor, sqlCursorSchema)?.values : undefined;

		const where = whereSql(
			cursorValues && terms.length
				? [
						...filterConditions,
						keysetPredicate(terms, cursorValues, backward, bind, mysqlKeyset),
					]
				: filterConditions,
		);

		const [dataRows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM ${quoteMysqlIdent(tableName)} ${where} ${keysetOrderBy(terms, backward, mysqlKeyset)} LIMIT ${Math.floor(limit) + 1}`,
			values as any,
		);

		const { rows, ...page } = keysetPage(dataRows as Record<string, unknown>[], {
			limit,
			cursor,
			backward,
			terms,
		});

		return {
			data: rows,
			meta: { limit, total, ...(estimated && { totalEstimated: true }), ...page },
		};
	}

	// =========================================================
	// IDbAdapter implementations
	// =========================================================

	// --- Databases ---

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

	// --- Tables ---

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const pool = await connector("mysql").pool(db);
		const estimates = await this.rowEstimates(pool);

		// Counting a table reads all of it, so only tables estimated below EXACT_COUNT_LIMIT rows
		// are counted; larger ones report their estimate.
		return Promise.all(
			[...estimates].map(async ([tableName, estimate]) => {
				if (estimate >= EXACT_COUNT_LIMIT) {
					return { tableName, rowCount: estimate, rowCountEstimated: true };
				}

				const [countRows] = await pool.execute<RowDataPacket[]>(
					`SELECT COUNT(*) as count FROM ${quoteMysqlIdent(tableName)}`,
				);

				return {
					tableName,
					rowCount: Number((countRows as Array<{ count: number }>)[0]?.count ?? 0),
				};
			}),
		);
	}

	async createTable({
		tableData,
		db,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		const { tableName, fields, foreignKeys } = tableData;
		const pool = await connector("mysql").pool(db);

		const columnDefs = fields.map((field: FieldDataType) => buildMysqlColumnDefinition(field));

		const constraintDefs: string[] = [];
		const primaryKeyFields = fields.filter((f: FieldDataType) => f.isPrimaryKey);

		if (primaryKeyFields.length > 0) {
			constraintDefs.push(
				`PRIMARY KEY (${primaryKeyFields.map((f: FieldDataType) => quoteMysqlIdent(f.columnName)).join(", ")})`,
			);
		}

		for (const field of fields as FieldDataType[]) {
			if (field.isUnique && !field.isPrimaryKey) {
				constraintDefs.push(
					`UNIQUE KEY ${quoteMysqlIdent(`uq_${tableName}_${field.columnName}`)} (${quoteMysqlIdent(field.columnName)})`,
				);
			}
		}

		const fkDefs =
			foreignKeys?.map((fk: ForeignKeyDataType) => {
				const name = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;

				return `CONSTRAINT ${quoteMysqlIdent(name)} FOREIGN KEY (${quoteMysqlIdent(fk.columnName)}) REFERENCES ${quoteMysqlIdent(fk.referencedTable)} (${quoteMysqlIdent(fk.referencedColumn)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) ?? [];

		await pool.execute<ResultSetHeader>(
			`CREATE TABLE ${quoteMysqlIdent(tableName)} (\n\t\t\t\t${[...columnDefs, ...constraintDefs, ...fkDefs].join(",\n\t\t\t\t")}\n\t\t\t) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		);
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, db, cascade } = params;
		const pool = await connector("mysql").pool(db);

		const [tableRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[tableName],
		);

		if (Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const rowCount = await this.getTableRowCount(pool, tableName);

		// A table's references to itself go with it.
		const referencing = (await this.referencingKeys(pool, tableName)).filter(
			(fk) => fk.table !== tableName,
		);

		if (!cascade && referencing.length > 0)
			return {
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: await this.rowsReferencingTable(pool, referencing),
			};

		try {
			if (cascade) {
				const connection = await pool.getConnection();

				try {
					await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
					await connection.execute(`DROP TABLE ${quoteMysqlIdent(tableName)}`);
					await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
				} finally {
					connection.release();
				}
			} else {
				await pool.execute(`DROP TABLE ${quoteMysqlIdent(tableName)}`);
			}

			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			await pool.execute("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
			const mysqlError = error as { errno?: number };

			if (
				mysqlError.errno === MYSQL_FK_DEPENDENCY ||
				mysqlError.errno === MYSQL_FK_VIOLATION
			) {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.rowsReferencingTable(pool, referencing),
				};
			}

			throw error;
		}
	}

	async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		const { tableName, newTableName, db } = params;
		this.assertDifferentTableName(tableName, newTableName);
		const pool = await connector("mysql").pool(db);

		await this.assertTableExists(pool, tableName);

		const [targetRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[newTableName],
		);

		if (Number((targetRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0) {
			throw new HTTPException(409, {
				message: `Table "${newTableName}" already exists`,
			});
		}

		await pool.execute<ResultSetHeader>(
			`RENAME TABLE ${quoteMysqlIdent(tableName)} TO ${quoteMysqlIdent(newTableName)}`,
		);
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await connector("mysql").pool(db);

		const [tableRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[tableName],
		);

		if (Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

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

	// --- Columns ---

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
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
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

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const {
			tableName,
			columnName,
			columnType,
			defaultValue,
			isPrimaryKey,
			isNullable,
			isUnique,
			isIdentity,
			isArray,
			db,
		} = params;

		const pool = await connector("mysql").pool(db);

		await this.assertTableExists(pool, tableName);

		const [colRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			[tableName, columnName],
		);

		if (Number((colRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0) {
			throw new HTTPException(409, {
				message: `Column "${columnName}" already exists in table "${tableName}"`,
			});
		}

		const colDef = buildMysqlColumnDefinition(
			{
				columnName,
				columnType,
				defaultValue,
				isPrimaryKey,
				isNullable,
				isUnique,
				isIdentity,
				isArray,
			},
			{ includePrimaryKey: true, includeUnique: true },
		);

		await pool.execute<ResultSetHeader>(
			`ALTER TABLE ${quoteMysqlIdent(tableName)} ADD COLUMN ${colDef}`,
		);
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, columnName, db } = params;
		const pool = await connector("mysql").pool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const [result] = await pool.execute<ResultSetHeader>(
			`ALTER TABLE ${quoteMysqlIdent(tableName)} DROP COLUMN ${quoteMysqlIdent(columnName)}`,
		);

		return { deletedCount: result.affectedRows };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = await connector("mysql").pool(db);

		await this.assertTableExists(pool, tableName);

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

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const pool = await connector("mysql").pool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const [newColRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			[tableName, newColumnName],
		);

		if (Number((newColRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0) {
			throw new HTTPException(409, {
				message: `Column "${newColumnName}" already exists in table "${tableName}"`,
			});
		}

		await pool.execute<ResultSetHeader>(
			`ALTER TABLE ${quoteMysqlIdent(tableName)} RENAME COLUMN ${quoteMysqlIdent(columnName)} TO ${quoteMysqlIdent(newColumnName)}`,
		);
	}

	// --- Server logs ---

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

	// --- Indexes ---

	async getTableIndexes({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		return await this.listIndexes(await connector("mysql").pool(db), tableName);
	}

	async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		const { tableName, indexName, columns, isUnique, method, db } = params;

		try {
			const pool = await connector("mysql").pool(db);
			await this.assertTableExists(pool, tableName);

			const [columnRows] = await pool.execute<RowDataPacket[]>(
				`SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
				[tableName],
			);

			const existing = new Set(columnRows.map((row) => String(row.columnName)));
			const missing = columns.find((column) => !existing.has(column));

			if (missing !== undefined)
				throw new HTTPException(400, {
					message: `Column "${missing}" does not exist in table "${tableName}"`,
				});

			if (method !== undefined)
				throw new HTTPException(400, { message: `Unsupported index method "${method}"` });

			await pool.query(
				`CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${quoteMysqlIdent(indexName)} ON ${quoteMysqlIdent(tableName)} (${columns.map(quoteMysqlIdent).join(", ")})`,
			);
		} catch (e) {
			const errno = (e as { errno?: number }).errno;

			if (e instanceof Error && (errno === MYSQL_DUP_KEYNAME || errno === MYSQL_DUP_ENTRY))
				throw new HTTPException(409, { message: e.message, cause: e });

			if (e instanceof Error && errno !== undefined && MYSQL_CANNOT_INDEX.has(errno))
				throw new HTTPException(400, { message: e.message, cause: e });
			throw e;
		}
	}

	async dropIndex({ tableName, indexName, db }: DropIndexParamsSchemaType): Promise<void> {
		try {
			const pool = await connector("mysql").pool(db);

			const index = (await this.listIndexes(pool, tableName)).find(
				(candidate) => candidate.indexName === indexName,
			);

			if (!index)
				throw new HTTPException(404, {
					message: `Index "${indexName}" does not exist on table "${tableName}"`,
				});

			if (index.kind !== "index")
				throw new HTTPException(400, {
					message: `Index "${indexName}" backs a constraint; drop the constraint to remove it`,
				});

			await pool.query(
				`DROP INDEX ${quoteMysqlIdent(indexName)} ON ${quoteMysqlIdent(tableName)}`,
			);
		} catch (e) {
			if (e instanceof Error && (e as { errno?: number }).errno === MYSQL_DROP_INDEX_FK)
				throw new HTTPException(400, { message: e.message, cause: e });
			throw e;
		}
	}

	// --- Records ---

	async addRecord({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const pool = await connector("mysql").pool(db);

		const booleanColumns = await this.getBooleanColumnSet(tableName, db);
		const columns = Object.keys(data);

		const values = Object.values(data).map((value, i) => {
			if (booleanColumns.has(columns[i]) && typeof value === "string") {
				return value === "true" ? 1 : 0;
			}

			return value;
		});

		const [result] = await pool.execute<ResultSetHeader>(
			`INSERT INTO ${quoteMysqlIdent(tableName)} (${columns.map(quoteMysqlIdent).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
			values as any,
		);

		if (result.affectedRows === 0) {
			throw new HTTPException(500, { message: `Failed to insert record into "${tableName}"` });
		}

		return { insertedCount: result.affectedRows };
	}

	async updateRecords({
		params,
		db,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		const pool = await connector("mysql").pool(db);

		const booleanColumns = await this.getBooleanColumnSet(tableName, db);

		const keyColumns = this.resolveKeyColumns(params);
		this.assertWholeKey(await this.getPrimaryKeyColumns(pool, tableName), keyColumns);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		const connection = await pool.getConnection();
		await connection.beginTransaction();

		try {
			let total = 0;

			for (const { keyValues, rowUpdates } of groups) {
				const setClauses = rowUpdates.map(
					(u) => `${quoteMysqlIdent(u.columnName)} = ${u.useDefault ? "DEFAULT" : "?"}`,
				);

				const values: unknown[] = rowUpdates
					.filter((u) => !u.useDefault)
					.map((u) => {
						if (u.value !== null && typeof u.value === "object")
							return JSON.stringify(u.value);

						if (booleanColumns.has(u.columnName) && typeof u.value === "string") {
							return u.value === "true" ? 1 : 0;
						}

						return u.value;
					});

				values.push(...keyValues);
				const whereClauses = keyColumns.map((column) => `${quoteMysqlIdent(column)} = ?`);

				const [result] = await connection.execute<ResultSetHeader>(
					`UPDATE ${quoteMysqlIdent(tableName)} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
					values as any,
				);

				if (result.affectedRows === 0) {
					throw new HTTPException(404, {
						message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
					});
				}

				total += result.affectedRows;
			}

			await connection.commit();

			return { updatedCount: total };
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pool = await connector("mysql").pool(db);
		const pkColumn = primaryKeys[0]?.columnName;

		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		this.assertDeletableKey(await this.getPrimaryKeyColumns(pool, tableName));

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map(() => "?").join(", ");
		const connection = await pool.getConnection();
		await connection.beginTransaction();

		try {
			const [result] = await connection.execute<ResultSetHeader>(
				`DELETE FROM ${quoteMysqlIdent(tableName)} WHERE ${quoteMysqlIdent(pkColumn)} IN (${placeholders})`,
				pkValues as any,
			);

			await connection.commit();

			return { deletedCount: result.affectedRows, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			await connection.rollback();
			const mysqlError = error as { errno?: number };

			if (mysqlError.errno === MYSQL_FK_VIOLATION) {
				const relatedRecords = await this.rowsReferencingRows(
					pool,
					tableName,
					undefined,
					`p.${quoteMysqlIdent(pkColumn)} IN (${placeholders})`,
					pkValues,
				);

				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}

			throw error;
		} finally {
			connection.release();
		}
	}

	async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pool = await connector("mysql").pool(db);
		const pkColumn = primaryKeys[0]?.columnName;

		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		this.assertDeletableKey(await this.getPrimaryKeyColumns(pool, tableName));

		const pkValues = primaryKeys.map((pk) => pk.value);
		const connection = await pool.getConnection();
		await connection.beginTransaction();

		// Foreign-key checks stay on: a dependent row this walk misses fails the delete and rolls
		// it back, instead of committing a reference to a deleted row.
		try {
			const fkConstraints = await this.getForeignKeyReferences(tableName, db);
			let totalRelated = 0;
			// Values already handled per relationship: a relationship reached again (a second FK
			// path) still processes its new values, and a cycle ends once no value is new.
			const handled = new Map<string, Set<string>>();

			const deleteRelatedRecursively = async (
				targetTable: string,
				targetColumn: string,
				reached: unknown[],
			) => {
				const key = `${targetTable}.${targetColumn}`;
				const seen = handled.get(key) ?? new Set<string>();
				handled.set(key, seen);
				const values = reached.filter((value) => !seen.has(String(value)));

				if (values.length === 0) return;

				for (const value of values) seen.add(String(value));

				const nestedFks = await this.getForeignKeyReferences(targetTable, db);

				for (const nestedFk of nestedFks) {
					const nestedPh = values.map(() => "?").join(", ");

					const [selectRows] = await connection.execute<RowDataPacket[]>(
						`SELECT ${quoteMysqlIdent(nestedFk.referencedColumn)} FROM ${quoteMysqlIdent(targetTable)} WHERE ${quoteMysqlIdent(targetColumn)} IN (${nestedPh})`,
						values as any[],
					);

					const nestedValues = (selectRows as Record<string, unknown>[]).map(
						(row) => row[nestedFk.referencedColumn],
					);

					if (nestedValues.length > 0) {
						await deleteRelatedRecursively(
							nestedFk.referencingTable,
							nestedFk.referencingColumn,
							nestedValues,
						);
					}
				}

				const ph = values.map(() => "?").join(", ");

				const [deleteResult] = await connection.execute<ResultSetHeader>(
					`DELETE FROM ${quoteMysqlIdent(targetTable)} WHERE ${quoteMysqlIdent(targetColumn)} IN (${ph})`,
					values as any[],
				);

				totalRelated += deleteResult.affectedRows;
			};

			// Every relationship, even a second one from the same child table: a message's
			// recipient_id must go as well as its sender_id.
			for (const constraint of fkConstraints) {
				await deleteRelatedRecursively(
					constraint.referencingTable,
					constraint.referencingColumn,
					pkValues,
				);
			}

			const mainPh = pkValues.map(() => "?").join(", ");

			const [result] = await connection.execute<ResultSetHeader>(
				`DELETE FROM ${quoteMysqlIdent(tableName)} WHERE ${quoteMysqlIdent(pkColumn)} IN (${mainPh})`,
				pkValues as any,
			);

			await connection.commit();

			return { deletedCount: result.affectedRows + totalRelated };
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	async bulkInsertRecords({
		tableName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records || records.length === 0) {
			throw new HTTPException(400, { message: "At least one record is required" });
		}

		const pool = await connector("mysql").pool(db);
		const connection = await pool.getConnection();

		try {
			const columns = Object.keys(records[0]);
			const colNames = columns.map(quoteMysqlIdent).join(", ");
			const booleanColumns = await this.getBooleanColumnSet(tableName, db);

			await connection.beginTransaction();

			for (let i = 0; i < records.length; i++) {
				const record = records[i];

				const values = columns.map((col) => {
					const value = record[col];

					if (booleanColumns.has(col) && typeof value === "string")
						return value === "true" ? 1 : 0;

					return value;
				});

				try {
					await connection.execute<ResultSetHeader>(
						`INSERT INTO ${quoteMysqlIdent(tableName)} (${colNames}) VALUES (${columns.map(() => "?").join(", ")})`,
						values as any,
					);
				} catch (error) {
					const failure = this.classifyError(error);

					if (failure.status !== 500) throw failure;
					throw new HTTPException(500, {
						message: `Failed to insert record ${i + 1}: ${failure.message}`,
						cause: error,
					});
				}
			}

			await connection.commit();

			return {
				success: true,
				message: `Successfully inserted ${records.length} record${records.length !== 1 ? "s" : ""}`,
				successCount: records.length,
				failureCount: 0,
			};
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}

	// --- Query ---

	async executeQuery({
		query,
		db,
	}: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		const pool = await connector("mysql").pool(db);

		if (!query?.trim()) throw new HTTPException(400, { message: "Query is required" });

		const cleaned = query.trim().replace(/;+$/, "");
		const start = performance.now();

		const [result, fields] = (await pool.execute(cleaned)) as [
			RowDataPacket[] | ResultSetHeader,
			FieldPacket[],
		];

		const duration = performance.now() - start;

		if (Array.isArray(result)) {
			const rows = result as RowDataPacket[];
			const columns = fields ? fields.map((f) => f.name) : Object.keys(rows[0] ?? {});

			return {
				columns,
				rows: rows as Record<string, unknown>[],
				rowCount: rows.length,
				duration,
				message: rows.length === 0 ? "OK" : undefined,
			};
		}

		const dmlResult = result as ResultSetHeader;

		return {
			columns: [],
			rows: [],
			rowCount: dmlResult.affectedRows,
			duration,
			message: `OK — ${dmlResult.affectedRows} row(s) affected`,
		};
	}

	// =========================================================
	// Private helpers
	// =========================================================

	/**
	 * InnoDB's row estimate for each base table of the database (or only `tableName`), in name
	 * order. MySQL 8 serves these from a cache refreshed once a day, so a table emptied this
	 * morning would still report its old size; the session reads them fresh instead. MariaDB and
	 * TiDB keep no such cache and reject the variable, which is harmless.
	 */
	private async rowEstimates(
		pool: MysqlPool,
		tableName?: string,
	): Promise<Map<string, number>> {
		const connection = await pool.getConnection();

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

			return new Map(
				(rows as Array<{ tableName: string; estimate: number | null }>).map((row) => [
					row.tableName,
					Number(row.estimate ?? 0),
				]),
			);
		} finally {
			connection.release();
		}
	}

	/**
	 * Rows matching the filters. Unfiltered, a table estimated at EXACT_COUNT_LIMIT rows or more
	 * reports that estimate, because an exact count reads the whole table and the total is
	 * fetched with every page.
	 */
	private async countRows(
		pool: MysqlPool,
		tableName: string,
		filterWhere: string,
		filterValues: unknown[],
	): Promise<{ total: number; estimated: boolean }> {
		if (!filterWhere) {
			const estimate = (await this.rowEstimates(pool, tableName)).get(tableName) ?? 0;

			if (estimate >= EXACT_COUNT_LIMIT) return { total: estimate, estimated: true };
		}

		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as total FROM ${quoteMysqlIdent(tableName)} ${filterWhere}`,
			filterValues as any,
		);

		return {
			total: Number((rows as Array<{ total: number }>)[0]?.total ?? 0),
			estimated: false,
		};
	}

	private isMariaDb(pool: MysqlPool): Promise<boolean> {
		let mariaDb = this.mariaDb.get(pool);

		if (!mariaDb) {
			mariaDb = pool
				.query<RowDataPacket[]>("SELECT VERSION() LIKE '%MariaDB%' AS mariadb")
				.then(([rows]) => Number(rows[0]?.mariadb) === 1)
				.catch((e) => {
					this.mariaDb.delete(pool);
					throw e;
				});
			this.mariaDb.set(pool, mariaDb);
		}

		return mariaDb;
	}

	private async getPrimaryKeyColumns(pool: MysqlPool, tableName: string): Promise<string[]> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COLUMN_NAME as column_name
			 FROM information_schema.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
			 ORDER BY ORDINAL_POSITION`,
			[tableName],
		);

		return (rows as Array<{ column_name: string }>).map((r) => r.column_name);
	}

	private async getForeignKeyReferences(
		tableName: string,
		db: string,
	): Promise<ForeignKeyConstraint[]> {
		const pool = await connector("mysql").pool(db);

		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT
				kcu.CONSTRAINT_NAME        AS constraint_name,
				kcu.TABLE_NAME             AS referencing_table,
				kcu.COLUMN_NAME            AS referencing_column,
				kcu.REFERENCED_TABLE_NAME  AS referenced_table,
				kcu.REFERENCED_COLUMN_NAME AS referenced_column
			FROM information_schema.KEY_COLUMN_USAGE kcu
			JOIN information_schema.TABLE_CONSTRAINTS tc
			  ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
			  AND kcu.TABLE_SCHEMA   = tc.TABLE_SCHEMA
			  AND kcu.TABLE_NAME     = tc.TABLE_NAME
			WHERE tc.CONSTRAINT_TYPE        = 'FOREIGN KEY'
			  AND kcu.TABLE_SCHEMA          = DATABASE()
			  AND kcu.REFERENCED_TABLE_NAME = ?`,
			[tableName],
		);

		return (rows as ForeignKeyConstraintRow[]).map((row) => ({
			constraintName: row.constraint_name,
			referencingTable: row.referencing_table,
			referencingColumn: row.referencing_column,
			referencedTable: row.referenced_table,
			referencedColumn: row.referenced_column,
		}));
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

	private async getTableRowCount(pool: MysqlPool, tableName: string): Promise<number> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as count FROM ${quoteMysqlIdent(tableName)}`,
		);

		return Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
	}

	private async getBooleanColumnSet(tableName: string, db: string): Promise<Set<string>> {
		const cols = await this.getTableColumns({ tableName, db });

		return new Set(cols.filter((c) => c.dataTypeLabel === "boolean").map((c) => c.columnName));
	}

	private async listIndexes(
		pool: MysqlPool,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.assertTableExists(pool, tableName);

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

	private async assertTableExists(pool: MysqlPool, tableName: string): Promise<void> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[tableName],
		);

		if (Number((rows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}
	}

	private async assertColumnExists(
		pool: MysqlPool,
		tableName: string,
		columnName: string,
	): Promise<void> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			[tableName, columnName],
		);

		if (Number((rows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		}
	}

	private parseMysqlEnumValues(columnType: string): string[] | null {
		const match = columnType.match(/^(?:enum|set)\((.+)\)$/i);

		if (!match?.[1]) return null;

		return match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
	}
}
