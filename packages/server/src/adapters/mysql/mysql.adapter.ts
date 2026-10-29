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
	CursorData,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteRecordSchemaType,
	DeleteTableParams,
	DeleteTableResult,
	DropIndexParamsSchemaType,
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogLevel,
	ServerLogsResult,
	SortDirection,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapMysqlToDataType, standardizeMysqlDataTypeLabel } from "@db-studio/shared/types";
import type { FieldPacket, ResultSetHeader, RowDataPacket } from "mysql2";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	BaseAdapter,
	EXACT_COUNT_LIMIT,
	type NormalizedRow,
	type QueryBundle,
} from "@/adapters/base.adapter.js";
import { getConnectionUrl, getMysqlPool } from "@/adapters/connections.js";
import {
	logDetail,
	logsUnavailable,
	newestEntries,
	SERVER_LOGS_LIMIT,
	SERVER_LOGS_MARKER,
} from "@/adapters/server-logs.js";
import { HTTPException } from "@/http-exception.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	buildCursorWhereClause,
	buildMysqlColumnDefinition,
	buildSortClause,
	buildWhereClause,
} from "./mysql.query-builder.js";

type MysqlPool = Awaited<ReturnType<typeof getMysqlPool>>;

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

const MYSQL_LOG_LEVELS: Record<string, ServerLogLevel> = {
	System: "info",
	Error: "error",
	Warning: "warning",
	Note: "info",
};

const quote = (name: string) => `\`${name.replaceAll("`", "``")}\``;

export class MySqlAdapter extends BaseAdapter {
	// Keyed by pool: tabs can work with a MySQL and a MariaDB server at once.
	private mariaDb = new WeakMap<MysqlPool, Promise<boolean>>();

	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
		const pool = await getMysqlPool(db);
		// biome-ignore lint/suspicious/noExplicitAny: mysql2 execute doesn't accept unknown[]
		const [rows] = await pool.execute(sql, values as any);
		return rows as T;
	}

	protected quoteIdentifier(name: string): string {
		return quote(name);
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapMysqlToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "LONGTEXT",
			number: "INT",
			boolean: "TINYINT(1)",
			json: "JSON",
			date: "DATETIME",
			array: "JSON",
			enum: "TEXT",
		};
		return map[universalType] ?? "LONGTEXT";
	}

	protected buildTableDataQuery(params: GetTableDataParams): QueryBundle {
		const {
			tableName,
			cursor = "",
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			filters = [],
		} = params;

		let sortColumns: string[] = [];
		let effectiveSortDirection: SortDirection = order;
		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
			effectiveSortDirection = sort[0].direction;
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}

		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		let cursorWhere = "";
		let cursorValues: unknown[] = [];
		if (cursor) {
			const cursorData = this.decodeCursor(cursor);
			if (cursorData) {
				const res = buildCursorWhereClause(cursorData, direction, effectiveSortDirection);
				cursorWhere = res.clause;
				cursorValues = res.values;
			}
		}

		let combinedWhere = "";
		if (filterWhere && cursorWhere) {
			combinedWhere = `WHERE ${filterWhere.replace(/^WHERE\s+/i, "")} AND ${cursorWhere}`;
		} else if (filterWhere) {
			combinedWhere = filterWhere;
		} else if (cursorWhere) {
			combinedWhere = `WHERE ${cursorWhere}`;
		}

		const sortClause = buildSortClause(Array.isArray(sort) ? sort : sort, order);
		let effectiveSortClause = sortClause;
		if (direction === "desc") {
			if (sortClause) {
				effectiveSortClause = sortClause
					.replace(/\bASC\b/gi, "TEMP_DESC")
					.replace(/\bDESC\b/gi, "ASC")
					.replace(/TEMP_DESC/g, "DESC");
			} else if (sortColumns.length > 0) {
				effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `${quote(col)} ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
			}
		} else if (!sortClause && sortColumns.length > 0) {
			effectiveSortClause = `ORDER BY ${sortColumns.map((col) => `${quote(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
		}

		const sql = `SELECT * FROM ${quote(tableName)} ${combinedWhere} ${effectiveSortClause} LIMIT ${limit + 1}`;
		const values = [...filterValues, ...cursorValues];
		const countSql = `SELECT COUNT(*) as total FROM ${quote(tableName)} ${filterWhere}`;

		return { sql, values, countSql, countValues: filterValues };
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(
		params: GetTableDataParams,
		rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null } {
		if (rows.length === 0) return { nextCursor: null, prevCursor: null };

		const { direction = "asc", sort = [], cursor } = params;
		let sortColumns: string[] = [];
		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}

		const createCursor = (row: NormalizedRow): string =>
			this.encodeCursor({
				values: Object.fromEntries(sortColumns.map((col) => [col, row[col]])),
				sortColumns,
			} satisfies CursorData);

		const firstRow = rows[0];
		const lastRow = rows[rows.length - 1];
		let nextCursor: string | null = null;
		let prevCursor: string | null = null;

		if (direction === "asc") {
			if (hasMore) nextCursor = createCursor(lastRow);
			if (cursor) prevCursor = createCursor(firstRow);
		} else {
			if (cursor) nextCursor = createCursor(lastRow);
			if (hasMore) prevCursor = createCursor(firstRow);
		}

		return { nextCursor, prevCursor };
	}

	// =========================================================
	// Override getTableData to incorporate primary-key cursor columns
	// =========================================================

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
		const pool = await getMysqlPool(db);
		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		const [pkColumns, { total, estimated }] = await Promise.all([
			this.getPrimaryKeyColumns(pool, tableName),
			this.countRows(pool, tableName, filterWhere, filterValues),
		]);

		let sortColumns: string[] = [];
		let effectiveSortDirection: SortDirection = order;
		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
			effectiveSortDirection = sort[0].direction;
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}

		const cursorColumns = [
			...sortColumns,
			...pkColumns.filter((pk) => !sortColumns.includes(pk)),
		];

		let cursorWhere = "";
		let cursorValues: unknown[] = [];
		if (cursor) {
			const cursorData = this.decodeCursor(cursor);
			if (cursorData) {
				const res = buildCursorWhereClause(cursorData, direction, effectiveSortDirection);
				cursorWhere = res.clause;
				cursorValues = res.values;
			}
		}

		let combinedWhere = "";
		if (filterWhere && cursorWhere) {
			combinedWhere = `WHERE ${filterWhere.replace(/^WHERE\s+/i, "")} AND ${cursorWhere}`;
		} else if (filterWhere) {
			combinedWhere = filterWhere;
		} else if (cursorWhere) {
			combinedWhere = `WHERE ${cursorWhere}`;
		}

		const sortClause = buildSortClause(Array.isArray(sort) ? sort : sort, order);
		const pkTieBreakerCols = pkColumns.filter((pk) => !sortColumns.includes(pk));
		let effectiveSortClause = sortClause;
		if (direction === "desc") {
			if (sortClause) {
				effectiveSortClause = sortClause
					.replace(/\bASC\b/gi, "TEMP_DESC")
					.replace(/\bDESC\b/gi, "ASC")
					.replace(/TEMP_DESC/g, "DESC");
				if (pkTieBreakerCols.length) {
					const tbDir = effectiveSortDirection === "asc" ? "DESC" : "ASC";
					effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `${quote(col)} ${tbDir}`).join(", ")}`;
				}
			} else if (cursorColumns.length > 0) {
				effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `${quote(col)} ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`).join(", ")}`;
			}
		} else if (!sortClause && cursorColumns.length > 0) {
			effectiveSortClause = `ORDER BY ${cursorColumns.map((col) => `${quote(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
		} else if (pkTieBreakerCols.length) {
			effectiveSortClause += `, ${pkTieBreakerCols.map((col) => `${quote(col)} ${effectiveSortDirection.toUpperCase()}`).join(", ")}`;
		}

		const [dataRows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM ${quote(tableName)} ${combinedWhere} ${effectiveSortClause} LIMIT ${Math.floor(limit) + 1}`,
			[...filterValues, ...cursorValues] as any,
		);

		let rows = dataRows as Record<string, unknown>[];
		const hasMore = rows.length > limit;
		if (hasMore) rows = rows.slice(0, limit);
		if (direction === "desc") rows = rows.reverse();

		let nextCursor: string | null = null;
		let prevCursor: string | null = null;

		if (rows.length > 0 && cursorColumns.length > 0) {
			const firstRow = rows[0];
			const lastRow = rows[rows.length - 1];
			const makeCursor = (row: Record<string, unknown>): CursorData => ({
				values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
				sortColumns: cursorColumns,
			});

			if (direction === "asc") {
				if (hasMore) nextCursor = this.encodeCursor(makeCursor(lastRow));
				if (cursor) prevCursor = this.encodeCursor(makeCursor(firstRow));
			} else {
				if (cursor) nextCursor = this.encodeCursor(makeCursor(lastRow));
				if (hasMore) prevCursor = this.encodeCursor(makeCursor(firstRow));
			}
		}

		return {
			data: rows,
			meta: {
				limit,
				total,
				...(estimated && { totalEstimated: true }),
				hasNextPage: direction === "asc" ? hasMore : !!cursor,
				hasPreviousPage: direction === "asc" ? !!cursor : hasMore,
				nextCursor,
				prevCursor,
			},
		};
	}

	// =========================================================
	// IDbAdapter implementations
	// =========================================================

	// --- Databases ---

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const pool = await getMysqlPool();
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await getMysqlPool();
		const [rows] = await pool.execute<RowDataPacket[]>("SELECT DATABASE() AS db");
		if (!rows[0])
			throw new HTTPException(500, { message: "No current database returned from server" });
		return (rows as Array<{ db: string }>)[0] as DatabaseSchemaType;
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const pool = await getMysqlPool();
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
		const urlDefaults = parseDatabaseUrl(getConnectionUrl());

		return {
			host: String(info.host || urlDefaults.host),
			port: Number(info.port || urlDefaults.port),
			user: String(info.user),
			database: String(info.database_name ?? ""),
			version: String(info.version),
			active_connections: Number((connRows as Array<{ cnt: number }>)[0]?.cnt ?? 0),
			max_connections: Number(info.max_connections),
		};
	}

	// --- Tables ---

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const pool = await getMysqlPool(db);
		const estimates = await this.rowEstimates(pool);

		// Counting a table reads all of it, so only tables estimated below EXACT_COUNT_LIMIT rows
		// are counted; larger ones report their estimate.
		return Promise.all(
			[...estimates].map(async ([tableName, estimate]) => {
				if (estimate >= EXACT_COUNT_LIMIT) {
					return { tableName, rowCount: estimate, rowCountEstimated: true };
				}
				const [countRows] = await pool.execute<RowDataPacket[]>(
					`SELECT COUNT(*) as count FROM ${quote(tableName)}`,
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
		const pool = await getMysqlPool(db);

		const columnDefs = fields.map((field: FieldDataType) => buildMysqlColumnDefinition(field));

		const constraintDefs: string[] = [];
		const primaryKeyFields = fields.filter((f: FieldDataType) => f.isPrimaryKey);
		if (primaryKeyFields.length > 0) {
			constraintDefs.push(
				`PRIMARY KEY (${primaryKeyFields.map((f: FieldDataType) => `\`${f.columnName}\``).join(", ")})`,
			);
		}
		for (const field of fields as FieldDataType[]) {
			if (field.isUnique && !field.isPrimaryKey) {
				constraintDefs.push(
					`UNIQUE KEY \`uq_${tableName}_${field.columnName}\` (\`${field.columnName}\`)`,
				);
			}
		}

		const fkDefs =
			foreignKeys?.map((fk: ForeignKeyDataType) => {
				const name = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;
				return `CONSTRAINT \`${name}\` FOREIGN KEY (\`${fk.columnName}\`) REFERENCES \`${fk.referencedTable}\` (\`${fk.referencedColumn}\`) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) ?? [];

		await pool.execute<ResultSetHeader>(
			`CREATE TABLE \`${tableName}\` (\n\t\t\t\t${[...columnDefs, ...constraintDefs, ...fkDefs].join(",\n\t\t\t\t")}\n\t\t\t) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		);
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, db, cascade } = params;
		const pool = await getMysqlPool(db);

		const [tableRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[tableName],
		);
		if (Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const rowCount = await this.getTableRowCount(pool, tableName);

		if (!cascade) {
			const relatedRecords = await this.getRelatedRecordsForTable(tableName, db);
			if (relatedRecords.length > 0) {
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
		}

		try {
			if (cascade) {
				const connection = await pool.getConnection();
				try {
					await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
					await connection.execute(`DROP TABLE \`${tableName}\``);
					await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
				} finally {
					connection.release();
				}
			} else {
				await pool.execute(`DROP TABLE \`${tableName}\``);
			}
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			await pool.execute("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
			const mysqlError = error as { errno?: number };
			if (
				mysqlError.errno === MYSQL_FK_DEPENDENCY ||
				mysqlError.errno === MYSQL_FK_VIOLATION
			) {
				const relatedRecords = await this.getRelatedRecordsForTable(tableName, db);
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to delete table "${tableName}"` });
		}
	}

	async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		try {
			const { tableName, newTableName, db } = params;
			this.assertDifferentTableName(tableName, newTableName);
			const pool = await getMysqlPool(db);

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
				`RENAME TABLE \`${tableName.replaceAll("`", "``")}\` TO \`${newTableName.replaceAll("`", "``")}\``,
			);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await getMysqlPool(db);
		const [tableRows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
			[tableName],
		);
		if (Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const [rows] = await pool.execute<RowDataPacket[]>(`SHOW CREATE TABLE \`${tableName}\``);
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
		const pool = await getMysqlPool(db);
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
		const pool = await getMysqlPool(db);

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
		await pool.execute<ResultSetHeader>(`ALTER TABLE \`${tableName}\` ADD COLUMN ${colDef}`);
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, columnName, db } = params;
		const pool = await getMysqlPool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const [result] = await pool.execute<ResultSetHeader>(
			`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``,
		);
		return { deletedCount: result.affectedRows };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = await getMysqlPool(db);

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
			`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${colDef}`,
		);
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const pool = await getMysqlPool(db);

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
			`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${columnName}\` TO \`${newColumnName}\``,
		);
	}

	// --- Server logs ---

	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const pool = await getMysqlPool(db);
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
			throw this.wrapError(e);
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
		try {
			return await this.listIndexes(await getMysqlPool(db), tableName);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		const { tableName, indexName, columns, isUnique, method, db } = params;
		try {
			const pool = await getMysqlPool(db);
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
				`CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${quote(indexName)} ON ${quote(tableName)} (${columns.map(quote).join(", ")})`,
			);
		} catch (e) {
			const errno = (e as { errno?: number }).errno;
			if (e instanceof Error && (errno === MYSQL_DUP_KEYNAME || errno === MYSQL_DUP_ENTRY))
				throw new HTTPException(409, { message: e.message, cause: e });
			if (e instanceof Error && errno !== undefined && MYSQL_CANNOT_INDEX.has(errno))
				throw new HTTPException(400, { message: e.message, cause: e });
			throw this.wrapError(e);
		}
	}

	async dropIndex({ tableName, indexName, db }: DropIndexParamsSchemaType): Promise<void> {
		try {
			const pool = await getMysqlPool(db);
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

			await pool.query(`DROP INDEX ${quote(indexName)} ON ${quote(tableName)}`);
		} catch (e) {
			if (e instanceof Error && (e as { errno?: number }).errno === MYSQL_DROP_INDEX_FK)
				throw new HTTPException(400, { message: e.message, cause: e });
			throw this.wrapError(e);
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
		const pool = await getMysqlPool(db);

		const booleanColumns = await this.getBooleanColumnSet(tableName, db);
		const columns = Object.keys(data);
		const values = Object.values(data).map((value, i) => {
			if (booleanColumns.has(columns[i]) && typeof value === "string") {
				return value === "true" ? 1 : 0;
			}
			return value;
		});

		const [result] = await pool.execute<ResultSetHeader>(
			`INSERT INTO \`${tableName}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
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
		const pool = await getMysqlPool(db);

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
					(u) => `\`${u.columnName}\` = ${u.useDefault ? "DEFAULT" : "?"}`,
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
				const whereClauses = keyColumns.map((column) => `\`${column}\` = ?`);

				const [result] = await connection.execute<ResultSetHeader>(
					`UPDATE \`${tableName}\` SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
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
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to update records in "${tableName}"` });
		} finally {
			connection.release();
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pool = await getMysqlPool(db);
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
				`DELETE FROM \`${tableName}\` WHERE \`${pkColumn}\` IN (${placeholders})`,
				pkValues as any,
			);
			await connection.commit();
			return { deletedCount: result.affectedRows, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			await connection.rollback();
			const mysqlError = error as { errno?: number };
			if (mysqlError.errno === MYSQL_FK_VIOLATION) {
				const relatedRecords = await this.getRelatedRecords(tableName, primaryKeys, db);
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to delete records from "${tableName}"`,
			});
		} finally {
			connection.release();
		}
	}

	async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pool = await getMysqlPool(db);
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
						`SELECT \`${nestedFk.referencedColumn}\` FROM \`${targetTable}\` WHERE \`${targetColumn}\` IN (${nestedPh})`,
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
					`DELETE FROM \`${targetTable}\` WHERE \`${targetColumn}\` IN (${ph})`,
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
				`DELETE FROM \`${tableName}\` WHERE \`${pkColumn}\` IN (${mainPh})`,
				pkValues as any,
			);

			await connection.commit();
			return { deletedCount: result.affectedRows + totalRelated };
		} catch (error) {
			await connection.rollback();
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to force delete records from "${tableName}"`,
			});
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

		const pool = await getMysqlPool(db);
		const connection = await pool.getConnection();

		try {
			const columns = Object.keys(records[0]);
			const colNames = columns.map((c) => `\`${c}\``).join(", ");
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
						`INSERT INTO \`${tableName}\` (${colNames}) VALUES (${columns.map(() => "?").join(", ")})`,
						values as any,
					);
				} catch (error) {
					throw new HTTPException(500, {
						message: `Failed to insert record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
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
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to bulk insert records into "${tableName}"`,
			});
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
		const pool = await getMysqlPool(db);
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
			`SELECT COUNT(*) as total FROM ${quote(tableName)} ${filterWhere}`,
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
		const pool = await getMysqlPool(db);
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

	private async getRelatedRecordsForTable(
		tableName: string,
		db: string,
	): Promise<RelatedRecord[]> {
		const fks = await this.getForeignKeyReferences(tableName, db);
		if (fks.length === 0) return [];

		const pool = await getMysqlPool(db);
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const [relatedRows] = await pool.execute<RowDataPacket[]>(
				`SELECT * FROM \`${fk.referencingTable}\` LIMIT 100`,
			);
			if (relatedRows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: relatedRows as Record<string, unknown>[],
				});
			}
		}
		return results;
	}

	private async getRelatedRecords(
		tableName: string,
		primaryKeys: DeleteRecordSchemaType["primaryKeys"],
		db: string,
	): Promise<RelatedRecord[]> {
		const fks = await this.getForeignKeyReferences(tableName, db);
		if (fks.length === 0) return [];

		const pool = await getMysqlPool(db);
		const pkValues = primaryKeys.map((pk) => pk.value);
		const results: RelatedRecord[] = [];

		const constraintsByTable = new Map<string, ForeignKeyConstraint[]>();
		for (const fk of fks) {
			const key = `${fk.referencingTable}.${fk.referencingColumn}`;
			if (!constraintsByTable.has(key)) constraintsByTable.set(key, []);
			constraintsByTable.get(key)?.push(fk);
		}

		for (const [, constraints] of constraintsByTable) {
			const fk = constraints[0];
			if (!fk) continue;
			const matchingPk = primaryKeys.find((pk) => pk.columnName === fk.referencedColumn);
			if (!matchingPk) continue;

			const placeholders = pkValues.map(() => "?").join(", ");
			const [relatedRows] = await pool.execute<RowDataPacket[]>(
				`SELECT * FROM \`${fk.referencingTable}\` WHERE \`${fk.referencingColumn}\` IN (${placeholders}) LIMIT 100`,
				pkValues as any,
			);
			if (relatedRows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: relatedRows as Record<string, unknown>[],
				});
			}
		}
		return results;
	}

	private async getTableRowCount(pool: MysqlPool, tableName: string): Promise<number> {
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT COUNT(*) as count FROM \`${tableName}\``,
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
					`${quote(String(row.COLUMN_NAME))}${row.SUB_PART === null ? "" : `(${row.SUB_PART})`}${row.COLLATION === "D" ? " DESC" : ""}`,
				);
			}
		}

		return [...byName.values()]
			.map(({ index, parts, hasExpression }) => ({
				...index,
				// MySQL has no stored CREATE INDEX text; this rebuilds it from the catalog rows.
				definition: !hasExpression
					? null
					: `CREATE ${index.isUnique ? "UNIQUE " : ""}INDEX ${quote(index.indexName)} ON ${quote(tableName)} (${parts.join(", ")})`,
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
