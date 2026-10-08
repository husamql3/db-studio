import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	SortType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapOracleToDataType, standardizeOracleDataTypeLabel } from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";
import oracledb, { type Connection, type Metadata } from "oracledb";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getOraclePool } from "@/adapters/connections.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	bindOracleValue,
	buildFilterConditions,
	buildOracleSelectList,
	buildOrderBy,
	createBinds,
	formatOracleDefault,
	groupOracleForeignKeys,
	IDENTITY_CLAUSE,
	quoteOracleIdent as ident,
	isSerialType,
	mapColumnTypeToOracle,
	type OracleForeignKey,
	type OracleForeignKeyRow,
	type OrderTerm,
	whereSql,
} from "./oracle.query-builder.js";
import { toJsonNumber } from "./oracle.values.js";

type Row = Record<string, unknown>;

type ColumnRow = {
	COLUMN_NAME: string;
	DATA_TYPE: string;
	DATA_LENGTH: number;
	DATA_PRECISION: number | null;
	DATA_SCALE: number | null;
	CHAR_LENGTH: number;
	NULLABLE: "Y" | "N";
	DATA_DEFAULT: string | null;
	DEFAULT_ON_NULL: "YES" | "NO";
	GENERATION_TYPE: "ALWAYS" | "BY DEFAULT" | null;
};

/** Oracle 23ai is the first release with SQL BOOLEAN and the native JSON type. */
const supportsNativeTypes = (conn: Connection) => conn.oracleServerVersion >= 2300000000;

const toHex = (value: unknown) => (Buffer.isBuffer(value) ? value.toString("hex") : value);

/** Thin mode converts native timestamps to millisecond-only Date, so adapter reads use TO_CHAR. */
const fetchTypeHandler = (meta: Metadata<unknown>) => {
	switch (meta.dbType) {
		case oracledb.DB_TYPE_NUMBER:
			return { type: oracledb.STRING, converter: toJsonNumber };
		case oracledb.DB_TYPE_CLOB:
		case oracledb.DB_TYPE_NCLOB:
			return { type: oracledb.STRING };
		case oracledb.DB_TYPE_BLOB:
			return { type: oracledb.BUFFER, converter: toHex };
		case oracledb.DB_TYPE_RAW:
		case oracledb.DB_TYPE_LONG_RAW:
			return { converter: toHex };
	}
	return undefined;
};

const toOracleValue = (value: unknown, columnType?: string): unknown => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return columnType === "BOOLEAN" ? value : Number(value);
	if (typeof value === "bigint") return value.toString();
	if (value instanceof Date || typeof value !== "object") return value;
	return JSON.stringify(value);
};

/** `DEFAULT NULL` is how Oracle clears a default, and it stays visible as the text "NULL". */
const defaultOf = (c: ColumnRow) => {
	const value = c.DATA_DEFAULT?.trim();
	return value && value.toUpperCase() !== "NULL" ? value : null;
};

const formatColumnType = (c: ColumnRow) => {
	switch (c.DATA_TYPE) {
		case "NUMBER":
			if (c.DATA_PRECISION === null) return c.DATA_SCALE === 0 ? "INTEGER" : "NUMBER";
			return c.DATA_SCALE
				? `NUMBER(${c.DATA_PRECISION},${c.DATA_SCALE})`
				: `NUMBER(${c.DATA_PRECISION})`;
		case "FLOAT":
			return `FLOAT(${c.DATA_PRECISION})`;
		case "VARCHAR2":
		case "NVARCHAR2":
		case "CHAR":
		case "NCHAR":
			return `${c.DATA_TYPE}(${c.CHAR_LENGTH})`;
		case "RAW":
			return `RAW(${c.DATA_LENGTH})`;
		default:
			return c.DATA_TYPE;
	}
};

type RowSelection = { columns: string[]; keys: unknown[][] };

const columnRef = (column: string, alias?: string) =>
	`${alias ? `${alias}.` : ""}${column === "ROWID" ? "ROWID" : ident(column)}`;

const joinOn = (fk: OracleForeignKey) =>
	fk.columns
		.map((column, index) => `c.${ident(column)} = p.${ident(fk.referencedColumns[index])}`)
		.join(" AND ");

const matchesAny = (
	selection: RowSelection,
	alias: string | undefined,
	bind: (value: unknown, column: string) => string,
) =>
	`(${selection.keys
		.map(
			(key) =>
				`(${selection.columns
					.map((column, index) => `${columnRef(column, alias)} = ${bind(key[index], column)}`)
					.join(" AND ")})`,
		)
		.join(" OR ")})`;

const isTemporalMetadata = <T>(meta: Metadata<T>) =>
	meta.dbType === oracledb.DB_TYPE_DATE ||
	meta.dbType === oracledb.DB_TYPE_TIMESTAMP ||
	meta.dbType === oracledb.DB_TYPE_TIMESTAMP_TZ ||
	meta.dbType === oracledb.DB_TYPE_TIMESTAMP_LTZ;

/** Oracle errors that are the user's to fix; each maps to a 400 with a readable reason. */
const LIMITATIONS: Array<[code: string, reason: string]> = [
	["ORA-01758", "A NOT NULL column added to a table with rows needs a default value."],
	[
		"ORA-01439",
		"Oracle can only change a column to an unrelated type while the column is empty.",
	],
	["ORA-22858", "Oracle cannot convert this column to or from a LOB (CLOB/BLOB) type."],
	["ORA-00932", "Oracle cannot compare, sort or filter CLOB, BLOB or JSON values this way."],
	["ORA-22848", "Oracle cannot sort or compare CLOB, BLOB or JSON values."],
	["ORA-12899", "The value is too long for the column."],
	["ORA-01441", "The column holds values longer than the new type allows."],
	["ORA-30675", "Oracle identity columns must have a numeric type."],
	["ORA-01861", "Dates must be written as YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS."],
	["ORA-01830", "Dates must be written as YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS."],
	["ORA-01843", "Dates must be written as YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS."],
];

/** ON UPDATE actions do not exist in Oracle, and ON DELETE has no SET DEFAULT. */
const FK_DELETE_ACTIONS: Record<string, string> = {
	CASCADE: " ON DELETE CASCADE",
	"SET NULL": " ON DELETE SET NULL",
	RESTRICT: "",
	"NO ACTION": "",
};

export class OracleAdapter extends BaseAdapter {
	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(_db: string, sql: string, values: unknown[]): Promise<T> {
		return this.withConnection((conn) => this.query(conn, sql, values)) as Promise<T>;
	}

	protected quoteIdentifier(name: string): string {
		return ident(name);
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapOracleToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "VARCHAR2(4000)",
			number: "NUMBER",
			boolean: "BOOLEAN",
			json: "JSON",
			date: "TIMESTAMP",
			array: "JSON",
			enum: "VARCHAR2(255)",
		};
		return map[universalType] ?? "VARCHAR2(4000)";
	}

	// getTableData is overridden: the ORDER BY needs the table's primary key, which the
	// synchronous template hooks cannot look up.
	protected buildTableDataQuery(_params: GetTableDataParams): QueryBundle {
		throw new Error("OracleAdapter.getTableData builds its own query");
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Row[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(): { nextCursor: string | null; prevCursor: string | null } {
		throw new Error("OracleAdapter.getTableData builds its own cursors");
	}

	protected override wrapError(e: unknown): HTTPException {
		if (e instanceof Error && !(e instanceof HTTPException)) {
			const limitation = LIMITATIONS.find(([code]) => e.message.startsWith(code));
			if (limitation)
				return new HTTPException(400, {
					message: `${limitation[1]} (${e.message.split("\n")[0]})`,
					cause: e,
				});
			if (e.message.startsWith("ORA-00955"))
				return new HTTPException(409, { message: e.message.split("\n")[0], cause: e });
		}
		return super.wrapError(e);
	}

	private async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
		try {
			const conn = await (await getOraclePool()).getConnection();
			try {
				return await fn(conn);
			} finally {
				await conn.close();
			}
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	/** Run DML on one connection as a single transaction. */
	private inTransaction<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
		return this.withConnection(async (conn) => {
			try {
				const result = await fn(conn);
				await conn.commit();
				return result;
			} catch (e) {
				await conn.rollback().catch(() => {});
				throw e;
			}
		});
	}

	private async query<T = Row>(conn: Connection, sql: string, values: unknown[] = []) {
		const result = await conn.execute<T>(sql, values, {
			outFormat: oracledb.OUT_FORMAT_OBJECT,
			fetchTypeHandler,
		});
		return result.rows ?? [];
	}

	private async execute(conn: Connection, sql: string, values: unknown[] = []) {
		return (await conn.execute(sql, values)).rowsAffected ?? 0;
	}

	// =========================================================
	// Records — paginated read
	// =========================================================

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const { tableName, limit = 50, sort = [], order = "asc", cursor, filters = [] } = params;

		return this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			const columnTypes = new Map(
				columns.map((column) => [column.COLUMN_NAME, column.DATA_TYPE]),
			);
			const primaryKey = await this.primaryKey(conn, tableName);

			const sorts: SortType[] =
				typeof sort === "string"
					? sort
						? [{ columnName: sort, direction: order }]
						: []
					: sort;
			const sortDirection = sorts[0]?.direction ?? order;
			const keyColumns: Array<string | null> = primaryKey.length ? primaryKey : [null];
			const terms: OrderTerm[] = [
				...sorts.map((s) => ({ column: s.columnName, direction: s.direction })),
				...keyColumns
					.filter((key) => !sorts.some((s) => s.columnName === key))
					.map((column) => ({ column, direction: sortDirection })),
			];

			const offset = cursor ? Number(this.decodeCursor(cursor)?.values._offset ?? 0) : 0;
			const { values, bind } = createBinds();
			const where = whereSql(buildFilterConditions(filters, bind, columnTypes));
			const filterValues = [...values];

			const [countRow] = await this.query<{ total: number }>(
				conn,
				`SELECT COUNT(*) AS "total" FROM ${ident(tableName)} ${where}`,
				filterValues,
			);
			const tableAlias = "t";
			const fetched = await this.query(
				conn,
				`SELECT ${buildOracleSelectList(columns, tableAlias)} FROM ${ident(tableName)} ${tableAlias} ${where} ${buildOrderBy(terms, tableAlias)} OFFSET ${bind(offset)} ROWS FETCH NEXT ${bind(limit + 1)} ROWS ONLY`,
				values,
			);

			const hasMore = fetched.length > limit;
			const offsetCursor = (at: number) =>
				this.encodeCursor({ values: { _offset: at }, sortColumns: ["_offset"] });

			return {
				data: fetched.slice(0, limit).map((row) => this.normalizeRow(row)),
				meta: {
					limit,
					total: Number(countRow?.total ?? 0),
					hasNextPage: hasMore,
					hasPreviousPage: offset > 0,
					nextCursor: hasMore ? offsetCursor(offset + limit) : null,
					prevCursor: offset > 0 ? offsetCursor(Math.max(0, offset - limit)) : null,
				},
			};
		});
	}

	override async exportTableData({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Row[] }> {
		return this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			const rows = await this.query(
				conn,
				`SELECT ${buildOracleSelectList(columns)} FROM ${ident(tableName)}`,
			);
			if (!rows.length)
				throw new HTTPException(404, {
					message: `Table "${tableName}" does not exist or has no data`,
				});
			return { cols: columns.map((column) => column.COLUMN_NAME), rows };
		});
	}

	// =========================================================
	// Databases
	// =========================================================

	/**
	 * An Oracle service is one database, so the list holds only the connected container
	 * (CON_NAME). Tables are the connected user's own schema.
	 */
	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const [row] = await this.query<{
				NAME: string;
				OWNER: string;
				BYTES: number;
				ENCODING: string;
			}>(
				conn,
				`SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS name, USER AS owner,
					(SELECT NVL(SUM(bytes), 0) FROM user_segments) AS bytes,
					(SELECT value FROM nls_database_parameters WHERE parameter = 'NLS_CHARACTERSET') AS encoding
				FROM dual`,
			);
			if (!row) return [];
			return [
				{
					name: row.NAME,
					size: this.formatBytes(Number(row.BYTES)),
					owner: row.OWNER,
					encoding: row.ENCODING,
				},
			];
		});
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return this.withConnection(async (conn) => ({ db: await this.containerName(conn) }));
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const pool = await getOraclePool().catch((e) => {
			throw this.wrapError(e);
		});
		return this.withConnection(async (conn) => {
			const [row] = await this.query<{ U: string }>(conn, "SELECT USER AS u FROM dual");
			const { host, port } = parseDatabaseUrl();
			return {
				host,
				port,
				user: row?.U ?? "",
				database: await this.containerName(conn),
				version: `Oracle ${conn.oracleServerVersionString}`,
				active_connections: pool.connectionsInUse,
				max_connections: pool.poolMax,
			};
		});
	}

	// =========================================================
	// Tables
	// =========================================================

	/**
	 * Row counts are exact (COUNT(*)) for tables whose optimizer statistics are missing or
	 * under 100,000 rows; larger tables report USER_TABLES.NUM_ROWS, which is an estimate as
	 * of the last statistics gathering.
	 */
	async getTablesList(_db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const tables = await this.query<{ TABLE_NAME: string; NUM_ROWS: number | null }>(
				conn,
				`SELECT table_name, num_rows FROM user_tables
				WHERE dropped = 'NO' AND nested = 'NO' AND secondary = 'N' AND (iot_type IS NULL OR iot_type = 'IOT')
				ORDER BY table_name`,
			);
			const toCount = tables.filter((t) => t.NUM_ROWS === null || t.NUM_ROWS < 100_000);
			const counts = new Map<string, number>();
			if (toCount.length) {
				const rows = await this.query<{ N: number; C: number }>(
					conn,
					toCount
						.map((t, i) => `SELECT ${i} AS n, COUNT(*) AS c FROM ${ident(t.TABLE_NAME)}`)
						.join(" UNION ALL "),
				);
				for (const row of rows) counts.set(toCount[row.N].TABLE_NAME, Number(row.C));
			}
			return tables.map((t) => ({
				tableName: t.TABLE_NAME,
				rowCount: counts.get(t.TABLE_NAME) ?? Number(t.NUM_ROWS ?? 0),
			}));
		});
	}

	/** One CREATE TABLE statement: identity, keys and foreign keys succeed or fail together. */
	async createTable({ tableData }: { tableData: CreateTableSchemaType }): Promise<void> {
		const { tableName, fields, foreignKeys = [] } = tableData;

		for (const fk of foreignKeys) {
			if (fk.onUpdate !== "NO ACTION" && fk.onUpdate !== "RESTRICT")
				throw new HTTPException(400, {
					message: `Oracle foreign keys have no ON UPDATE actions (${fk.onUpdate} on "${fk.columnName}"). Use NO ACTION.`,
				});
			if (!(fk.onDelete in FK_DELETE_ACTIONS))
				throw new HTTPException(400, {
					message: `Oracle foreign keys do not support ON DELETE ${fk.onDelete} (on "${fk.columnName}"). Use CASCADE, SET NULL or NO ACTION.`,
				});
		}

		await this.withConnection(async (conn) => {
			const native = supportsNativeTypes(conn);
			const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);
			const definitions = fields.map((field) =>
				this.columnDefinition(field, { withConstraints: false, native }),
			);
			if (primaryKey.length)
				definitions.push(`PRIMARY KEY (${primaryKey.map(ident).join(", ")})`);
			for (const field of fields) {
				if (field.isUnique && !field.isPrimaryKey)
					definitions.push(`UNIQUE (${ident(field.columnName)})`);
			}
			for (const fk of foreignKeys) {
				definitions.push(
					`FOREIGN KEY (${ident(fk.columnName)}) REFERENCES ${ident(fk.referencedTable)} (${ident(fk.referencedColumn)})${FK_DELETE_ACTIONS[fk.onDelete]}`,
				);
			}
			await conn.execute(`CREATE TABLE ${ident(tableName)} (${definitions.join(", ")})`);
		});
	}

	async deleteTable({ tableName, cascade }: DeleteTableParams): Promise<DeleteTableResult> {
		return this.withConnection(async (conn) => {
			await this.requireColumns(conn, tableName);
			const referencing = (await this.foreignKeys(conn, "referenced", tableName)).filter(
				(fk) => fk.referencingTable !== tableName,
			);
			if (referencing.length && !cascade)
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.sampleReferencingRows(conn, referencing),
				};

			const [row] = await this.query<{ C: number }>(
				conn,
				`SELECT COUNT(*) AS c FROM ${ident(tableName)}`,
			);
			// CASCADE CONSTRAINTS drops the foreign keys of referencing tables, not their rows.
			await conn.execute(
				`DROP TABLE ${ident(tableName)}${cascade ? " CASCADE CONSTRAINTS" : ""}`,
			);
			return { deletedCount: Number(row?.C ?? 0), fkViolation: false, relatedRecords: [] };
		});
	}

	async renameTable({ tableName, newTableName }: RenameTableParamsSchemaType): Promise<void> {
		this.assertDifferentTableName(tableName, newTableName);
		await this.withConnection(async (conn) => {
			await this.requireColumns(conn, tableName);
			if ((await this.columns(conn, newTableName)).length)
				throw new HTTPException(409, { message: `Table "${newTableName}" already exists` });
			await conn.execute(`ALTER TABLE ${ident(tableName)} RENAME TO ${ident(newTableName)}`);
		});
	}

	async getTableSchema({ tableName }: { tableName: string }): Promise<string> {
		return this.withConnection(async (conn) => {
			await this.requireColumns(conn, tableName);
			await conn.execute(
				`BEGIN
					DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', FALSE);
					DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
				END;`,
			);
			const [row] = await this.query<{ DDL: string }>(
				conn,
				"SELECT DBMS_METADATA.GET_DDL('TABLE', :1) AS ddl FROM dual",
				[tableName],
			);
			return row?.DDL.trim() ?? "";
		});
	}

	// =========================================================
	// Columns
	// =========================================================

	async getTableColumns({
		tableName,
	}: {
		tableName: string;
	}): Promise<ColumnInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			const primaryKey = new Set(await this.primaryKey(conn, tableName));
			const references = new Map(
				(await this.foreignKeys(conn, "referencing", tableName)).flatMap((fk) =>
					fk.columns.map(
						(column, index) =>
							[
								column,
								{
									referencedTable: fk.referencedTable,
									referencedColumn: fk.referencedColumns[index],
								},
							] as const,
					),
				),
			);

			return columns.map((col) => {
				const fk = references.get(col.COLUMN_NAME);
				const type = formatColumnType(col);
				return {
					columnName: col.COLUMN_NAME,
					dataType: mapOracleToDataType(type),
					dataTypeLabel: standardizeOracleDataTypeLabel(type),
					isNullable: col.NULLABLE === "Y",
					// An identity's DATA_DEFAULT names its system sequence (ISEQ$$_n); show the clause instead.
					columnDefault: col.GENERATION_TYPE
						? `GENERATED ${col.GENERATION_TYPE}${col.DEFAULT_ON_NULL === "YES" ? " ON NULL" : ""} AS IDENTITY`
						: defaultOf(col),
					isPrimaryKey: primaryKey.has(col.COLUMN_NAME),
					isForeignKey: !!fk,
					referencedTable: fk?.referencedTable ?? null,
					referencedColumn: fk?.referencedColumn ?? null,
					enumValues: null,
				};
			});
		});
	}

	/** One ALTER TABLE ... ADD, constraints inline, so it applies fully or not at all. */
	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName } = params;
		await this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			if (columns.some((c) => c.COLUMN_NAME === columnName))
				throw new HTTPException(409, {
					message: `Column "${columnName}" already exists in table "${tableName}"`,
				});
			const definition = this.columnDefinition(params, {
				withConstraints: true,
				native: supportsNativeTypes(conn),
			});
			await conn.execute(`ALTER TABLE ${ident(tableName)} ADD (${definition})`);
		});
	}

	async deleteColumn({
		tableName,
		columnName,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		await this.withConnection(async (conn) => {
			await this.requireColumn(conn, tableName, columnName);
			await conn.execute(`ALTER TABLE ${ident(tableName)} DROP COLUMN ${ident(columnName)}`);
		});
		return { deletedCount: 1 };
	}

	/**
	 * One ALTER TABLE ... MODIFY. Oracle rejects restating the current nullability
	 * (ORA-01451/ORA-01442), so NULL/NOT NULL is only written when it changes, and it has no
	 * DROP DEFAULT: `DEFAULT NULL` clears an existing default.
	 */
	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue } = params;
		await this.withConnection(async (conn) => {
			const native = supportsNativeTypes(conn);
			const column = (await this.requireColumn(conn, tableName, columnName)).find(
				(c) => c.COLUMN_NAME === columnName,
			);
			let definition = `${ident(columnName)} ${mapColumnTypeToOracle(columnType, false, native)}`;
			if (defaultValue?.trim())
				definition += ` DEFAULT ${formatOracleDefault(defaultValue, native)}`;
			else if (column && !column.GENERATION_TYPE && defaultOf(column))
				definition += " DEFAULT NULL";
			if ((column?.NULLABLE === "Y") !== isNullable)
				definition += isNullable ? " NULL" : " NOT NULL";
			await conn.execute(`ALTER TABLE ${ident(tableName)} MODIFY (${definition})`);
		});
	}

	async renameColumn({
		tableName,
		columnName,
		newColumnName,
	}: RenameColumnParamsSchemaType): Promise<void> {
		await this.withConnection(async (conn) => {
			const columns = await this.requireColumn(conn, tableName, columnName);
			if (columns.some((c) => c.COLUMN_NAME === newColumnName))
				throw new HTTPException(409, {
					message: `Column "${newColumnName}" already exists in table "${tableName}"`,
				});
			await conn.execute(
				`ALTER TABLE ${ident(tableName)} RENAME COLUMN ${ident(columnName)} TO ${ident(newColumnName)}`,
			);
		});
	}

	// =========================================================
	// Records
	// =========================================================

	async addRecord({
		params,
	}: {
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const columns = Object.keys(data);
		if (!columns.length)
			throw new HTTPException(400, { message: "No data provided for insert" });

		const insertedCount = await this.inTransaction(async (conn) => {
			const types = await this.columnTypes(conn, tableName);
			const { values, bind } = createBinds();
			const expressions = columns.map((column) =>
				bindOracleValue(
					toOracleValue(data[column], types.get(column)),
					types.get(column),
					bind,
				),
			);
			return this.execute(
				conn,
				`INSERT INTO ${ident(tableName)} (${columns.map(ident).join(", ")}) VALUES (${expressions.join(", ")})`,
				values,
			);
		});
		return { insertedCount };
	}

	async updateRecords({
		params,
	}: {
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		const keyColumns = this.resolveKeyColumns(params);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		const updatedCount = await this.inTransaction(async (conn) => {
			const types = await this.columnTypes(conn, tableName);
			let total = 0;
			for (const { keyValues, rowUpdates } of groups) {
				const { values, bind } = createBinds();
				const set = rowUpdates
					.map(
						(u) =>
							`${ident(u.columnName)} = ${bindOracleValue(
								toOracleValue(u.value, types.get(u.columnName)),
								types.get(u.columnName),
								bind,
							)}`,
					)
					.join(", ");
				const where = keyColumns
					.map(
						(c, i) =>
							`${ident(c)} = ${bindOracleValue(
								toOracleValue(keyValues[i], types.get(c)),
								types.get(c),
								bind,
							)}`,
					)
					.join(" AND ");
				const changed = await this.execute(
					conn,
					`UPDATE ${ident(tableName)} SET ${set} WHERE ${where}`,
					values,
				);
				if (changed === 0)
					throw new HTTPException(404, {
						message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
					});
				total += changed;
			}
			return total;
		});
		return { updatedCount };
	}

	async deleteRecords({
		tableName,
		primaryKeys,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		const selection: RowSelection = {
			columns: [pkColumn],
			keys: primaryKeys.map((key) => [key.value]),
		};

		return this.withConnection(async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName));
			const types = await this.columnTypes(conn, tableName);
			try {
				const { values, bind } = createBinds();
				const where = matchesAny(selection, undefined, (value, column) =>
					bindOracleValue(toOracleValue(value, types.get(column)), types.get(column), bind),
				);
				const deletedCount = await this.execute(
					conn,
					`DELETE FROM ${ident(tableName)} WHERE ${where}`,
					values,
				);
				await conn.commit();
				return { deletedCount, fkViolation: false, relatedRecords: [] };
			} catch (e) {
				await conn.rollback().catch(() => {});
				if (!(e instanceof Error) || !e.message.startsWith("ORA-02292")) throw e;
				const relatedRecords: RelatedRecord[] = [];
				for (const fk of await this.foreignKeys(conn, "referenced", tableName)) {
					const childColumns = await this.requireColumns(conn, fk.referencingTable);
					const { values, bind } = createBinds();
					const where = matchesAny(selection, "p", (value, column) =>
						bindOracleValue(toOracleValue(value, types.get(column)), types.get(column), bind),
					);
					const records = await this.query(
						conn,
						`SELECT ${buildOracleSelectList(childColumns, "c")} FROM ${ident(fk.referencingTable)} c JOIN ${ident(tableName)} p ON ${joinOn(fk)} WHERE ${where} FETCH FIRST 100 ROWS ONLY`,
						values,
					);
					if (records.length)
						relatedRecords.push({
							tableName: fk.referencingTable,
							columnName: fk.columns.join(", "),
							constraintName: fk.constraintName,
							records,
						});
				}
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
		});
	}

	/** Deletes referencing rows children-first, then the rows themselves, in one transaction. */
	async forceDeleteRecords({
		tableName,
		primaryKeys,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const purge = async (
			conn: Connection,
			table: string,
			selection: RowSelection,
			path: string[],
		): Promise<number> => {
			if (!selection.keys.length) return 0;
			if (path.includes(table))
				throw new HTTPException(400, {
					message: `Cannot force delete: the foreign keys ${[...path, table].map((t) => `"${t}"`).join(" -> ")} form a cycle.`,
				});
			const types = await this.columnTypes(conn, table);
			let deleted = 0;
			for (const fk of await this.foreignKeys(conn, "referenced", table)) {
				const { values, bind } = createBinds();
				const where = matchesAny(selection, "p", (value, column) =>
					column === "ROWID"
						? `CHARTOROWID(${bind(value)})`
						: bindOracleValue(
								toOracleValue(value, types.get(column)),
								types.get(column),
								bind,
							),
				);
				const referenced = await this.query<{ __rowid: string }>(
					conn,
					`SELECT DISTINCT ROWIDTOCHAR(c.ROWID) AS "__rowid" FROM ${ident(fk.referencingTable)} c JOIN ${ident(table)} p ON ${joinOn(fk)} WHERE ${where}`,
					values,
				);
				deleted += await purge(
					conn,
					fk.referencingTable,
					{ columns: ["ROWID"], keys: referenced.map((row) => [row.__rowid]) },
					[...path, table],
				);
			}
			const { values, bind } = createBinds();
			const where = matchesAny(selection, undefined, (value, column) =>
				column === "ROWID"
					? `CHARTOROWID(${bind(value)})`
					: bindOracleValue(toOracleValue(value, types.get(column)), types.get(column), bind),
			);
			return (
				deleted +
				(await this.execute(conn, `DELETE FROM ${ident(table)} WHERE ${where}`, values))
			);
		};

		const deletedCount = await this.inTransaction(async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName));
			return purge(
				conn,
				tableName,
				{ columns: [pkColumn], keys: primaryKeys.map((key) => [key.value]) },
				[],
			);
		});
		return { deletedCount };
	}

	async bulkInsertRecords({
		tableName,
		records,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records?.length)
			throw new HTTPException(400, { message: "At least one record is required" });

		const columns = Object.keys(records[0]);
		const successCount = await this.inTransaction(async (conn) => {
			const types = await this.columnTypes(conn, tableName);
			let expressions: string[] = [];
			const rows = records.map((record, index) => {
				const { values, bind } = createBinds();
				const rowExpressions = columns.map((column) =>
					bindOracleValue(
						toOracleValue(record[column], types.get(column)),
						types.get(column),
						bind,
					),
				);
				if (index === 0) expressions = rowExpressions;
				return values;
			});
			const result = await conn.executeMany(
				`INSERT INTO ${ident(tableName)} (${columns.map(ident).join(", ")}) VALUES (${expressions.join(", ")})`,
				rows,
			);
			return result.rowsAffected ?? records.length;
		});
		return {
			success: true,
			message: `Bulk insert completed: ${successCount} records inserted`,
			successCount,
			failureCount: 0,
		};
	}

	// =========================================================
	// Query
	// =========================================================

	/**
	 * Runs one statement with autocommit. A trailing `;` is stripped from SQL (Oracle rejects
	 * it) but kept on PL/SQL blocks, where it ends the last statement; a SQL*Plus `/` line is
	 * dropped. Native DATE and TIMESTAMP result columns are refused because Thin mode converts
	 * them to millisecond-only Date objects; callers can select them with an explicit TO_CHAR.
	 */
	async executeQuery({ query: sql }: { query: string }): Promise<ExecuteQueryResult> {
		if (!sql?.trim()) throw new HTTPException(400, { message: "Query is required" });

		const trimmed = sql
			.trim()
			.replace(/\n\s*\/$/, "")
			.trim();
		const isPlsql =
			/^(BEGIN|DECLARE|CREATE\s+(OR\s+REPLACE\s+)?((NON)?EDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE))\b/i.test(
				trimmed,
			);
		const statement = isPlsql ? trimmed : trimmed.replace(/;\s*$/, "");

		return this.withConnection(async (conn) => {
			const start = performance.now();
			const result = await conn.execute<Row>(statement, [], {
				outFormat: oracledb.OUT_FORMAT_OBJECT,
				fetchTypeHandler,
				autoCommit: true,
				resultSet: true,
			});
			const duration = performance.now() - start;

			if (result.resultSet) {
				if (result.metaData?.some(isTemporalMetadata)) {
					await result.resultSet.close();
					throw new HTTPException(400, {
						message:
							"Oracle query results with native DATE or TIMESTAMP columns must use TO_CHAR with an explicit format so fractional seconds are not lost.",
					});
				}
				let rows: Row[];
				try {
					rows = await result.resultSet.getRows();
				} finally {
					await result.resultSet.close();
				}
				return {
					columns: result.metaData?.map((meta) => meta.name) ?? [],
					rows,
					rowCount: rows.length,
					duration,
					message: rows.length === 0 ? "OK" : undefined,
				};
			}
			const affected = result.rowsAffected ?? 0;
			return {
				columns: [],
				rows: [],
				rowCount: affected,
				duration,
				message: result.rowsAffected === undefined ? "OK" : `OK (${affected} rows affected)`,
			};
		});
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private columnDefinition(
		field: {
			columnName: string;
			columnType: string;
			defaultValue?: string | null;
			isPrimaryKey?: boolean;
			isNullable?: boolean;
			isUnique?: boolean;
			isIdentity?: boolean;
			isArray?: boolean;
		},
		{ withConstraints, native }: { withConstraints: boolean; native: boolean },
	): string {
		let def = `${ident(field.columnName)} ${mapColumnTypeToOracle(field.columnType, field.isArray ?? false, native)}`;
		if (field.isIdentity || isSerialType(field.columnType)) def += ` ${IDENTITY_CLAUSE}`;
		else if (field.defaultValue?.trim())
			def += ` DEFAULT ${formatOracleDefault(field.defaultValue, native)}`;
		if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";
		if (withConstraints) {
			if (field.isPrimaryKey) def += " PRIMARY KEY";
			else if (field.isUnique) def += " UNIQUE";
		}
		return def;
	}

	private formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	private async containerName(conn: Connection): Promise<string> {
		const [row] = await this.query<{ DB: string }>(
			conn,
			"SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS db FROM dual",
		);
		return row?.DB ?? "";
	}

	private columns(conn: Connection, tableName: string): Promise<ColumnRow[]> {
		return this.query<ColumnRow>(
			conn,
			`SELECT c.column_name, c.data_type, c.data_length, c.data_precision, c.data_scale, c.char_length,
				c.nullable, c.data_default, c.default_on_null, i.generation_type
			FROM user_tab_columns c
			LEFT JOIN user_tab_identity_cols i ON i.table_name = c.table_name AND i.column_name = c.column_name
			WHERE c.table_name = :1 ORDER BY c.column_id`,
			[tableName],
		);
	}

	private async columnTypes(conn: Connection, tableName: string) {
		const columns = await this.requireColumns(conn, tableName);
		return new Map(columns.map((c) => [c.COLUMN_NAME, c.DATA_TYPE]));
	}

	private async requireColumns(conn: Connection, tableName: string): Promise<ColumnRow[]> {
		const columns = await this.columns(conn, tableName);
		if (!columns.length)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		return columns;
	}

	private async requireColumn(
		conn: Connection,
		tableName: string,
		columnName: string,
	): Promise<ColumnRow[]> {
		const columns = await this.requireColumns(conn, tableName);
		if (!columns.some((c) => c.COLUMN_NAME === columnName))
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		return columns;
	}

	private async primaryKey(conn: Connection, tableName: string): Promise<string[]> {
		const rows = await this.query<{ COLUMN_NAME: string }>(
			conn,
			`SELECT cc.column_name FROM user_constraints c
			JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
			WHERE c.constraint_type = 'P' AND c.table_name = :1
			ORDER BY cc.position`,
			[tableName],
		);
		return rows.map((r) => r.COLUMN_NAME);
	}

	/** Foreign keys declared on `tableName` ("referencing") or pointing at it ("referenced"). */
	private async foreignKeys(
		conn: Connection,
		side: "referencing" | "referenced",
		tableName: string,
	): Promise<OracleForeignKey[]> {
		const rows = await this.query<OracleForeignKeyRow>(
			conn,
			`SELECT c.constraint_name, c.table_name AS referencing_table, cc.column_name AS referencing_column,
				r.table_name AS referenced_table, rc.column_name AS referenced_column
			FROM user_constraints c
			JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
			JOIN user_constraints r ON r.constraint_name = c.r_constraint_name AND r.owner = c.r_owner
			JOIN user_cons_columns rc ON rc.constraint_name = r.constraint_name AND rc.position = cc.position
			WHERE c.constraint_type = 'R' AND ${side === "referencing" ? "c" : "r"}.table_name = :1
			ORDER BY c.constraint_name, cc.position`,
			[tableName],
		);
		return groupOracleForeignKeys(rows);
	}

	private async sampleReferencingRows(
		conn: Connection,
		references: OracleForeignKey[],
	): Promise<RelatedRecord[]> {
		const related: RelatedRecord[] = [];
		for (const fk of references) {
			const columns = await this.requireColumns(conn, fk.referencingTable);
			const records = await this.query(
				conn,
				`SELECT ${buildOracleSelectList(columns)} FROM ${ident(fk.referencingTable)} WHERE ${fk.columns.map((column) => `${ident(column)} IS NOT NULL`).join(" AND ")} FETCH FIRST 100 ROWS ONLY`,
			);
			if (records.length)
				related.push({
					tableName: fk.referencingTable,
					columnName: fk.columns.join(", "),
					constraintName: fk.constraintName,
					records,
				});
		}
		return related;
	}
}
