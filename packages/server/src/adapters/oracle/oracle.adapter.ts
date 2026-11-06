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
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogLevel,
	ServerLogsResult,
	TableDataResultSchemaType,
} from "@db-studio/shared/types";
import {
	isSerialType,
	mapOracleToDataType,
	standardizeOracleDataTypeLabel,
} from "@db-studio/shared/types";
import type { Connection, Metadata } from "oracledb";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import type { DriverErrorClass } from "@/adapters/base.adapter.js";
import {
	logDetail,
	logsUnavailable,
	newestEntries,
	SERVER_LOGS_LIMIT,
	SERVER_LOGS_MARKER,
} from "@/adapters/server-logs.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import { offsetOf, offsetOrderBy, offsetPage, orderTerms } from "@/adapters/sql-pagination.js";
import {
	groupKeyColumns,
	RELATED_SAMPLE,
	type ReferencingKey,
	SqlAdapter,
	type StatementResult,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { loadedDriver } from "@/drivers.js";
import { formatFileSize } from "@/file-size.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	bindOracleValue,
	buildOracleSelectList,
	formatOracleDefault,
	IDENTITY_CLAUSE,
	quoteOracleIdent as ident,
	mapColumnTypeToOracle,
	oracleFilters,
	oraclePlaceholder,
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
	const oracledb = loadedDriver("oracle");

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

const toOracleValue = (
	value: unknown,
	columnType?: string,
): string | number | boolean | Date | null => {
	if (value === null || value === undefined) return null;

	if (typeof value === "boolean") return columnType === "BOOLEAN" ? value : Number(value);

	if (typeof value === "bigint") return value.toString();

	if (value instanceof Date || typeof value === "string" || typeof value === "number") {
		return value;
	}

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

const joinOn = (fk: ReferencingKey) =>
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

const isTemporalMetadata = <T>(meta: Metadata<T>) => {
	const oracledb = loadedDriver("oracle");

	return (
		meta.dbType === oracledb.DB_TYPE_DATE ||
		meta.dbType === oracledb.DB_TYPE_TIMESTAMP ||
		meta.dbType === oracledb.DB_TYPE_TIMESTAMP_TZ ||
		meta.dbType === oracledb.DB_TYPE_TIMESTAMP_LTZ
	);
};

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

/**
 * No listener, unknown service or SID, bad credentials, locked account, timeout or lost
 * connection; NJS-5xx are the thin driver's network errors.
 */
const UNREACHABLE =
	/^(ORA-(01017|03113|03114|03135|12170|12505|12514|12541|28000)|NJS-5(00|01|03|10|11|18|21)):/;

type IndexKeyRow = {
	INDEX_NAME: string;
	INDEX_TYPE: string;
	UNIQUENESS: string;
	CONSTRAINT_TYPE: string | null;
	COLUMN_NAME: string;
	DESCEND: string;
	COLUMN_EXPRESSION: string | null;
};

/** The new index repeats an existing one: name taken, same column list, or duplicate keys. */
const INDEX_CONFLICTS = ["ORA-00955", "ORA-01408", "ORA-01452"];

/**
 * The column or name cannot be indexed: identifier too long (ORA-00972), key too long
 * (ORA-01450), LOB or JSON column (ORA-02327), type that cannot be unique (ORA-02329).
 */
const CANNOT_INDEX = ["ORA-00972", "ORA-01450", "ORA-02327", "ORA-02329"];

/** The index enforces a primary key or unique constraint. */
const INDEX_IN_USE = "ORA-02429";

const startsWithAny = (e: unknown, codes: string[]): e is Error =>
	e instanceof Error && codes.some((code) => e.message.startsWith(code));

/** ON UPDATE actions do not exist in Oracle, and ON DELETE has no SET DEFAULT. */
const FK_DELETE_ACTIONS: Record<string, string> = {
	CASCADE: " ON DELETE CASCADE",
	"SET NULL": " ON DELETE SET NULL",
	RESTRICT: "",
	"NO ACTION": "",
};

/** MESSAGE_LEVEL of the alert log: 1 critical, 2 severe, 8 important, 16 normal. */
const ORACLE_LOG_LEVELS: Record<number, ServerLogLevel> = {
	1: "fatal",
	2: "error",
	8: "warning",
	16: "info",
};

export class OracleAdapter extends SqlAdapter<Connection> {
	protected readonly quoteIdentifier = ident;
	protected readonly engine = "oracle";
	protected readonly placeholder = oraclePlaceholder;

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		const firstLine = e.message.split("\n")[0];
		const limitation = LIMITATIONS.find(([code]) => e.message.startsWith(code));

		if (limitation) return { status: 400, message: `${limitation[1]} (${firstLine})` };

		if (e.message.startsWith("ORA-00955")) return { status: 409, message: firstLine };

		if (UNREACHABLE.test(e.message)) return { status: 503 };

		return undefined;
	}

	protected connect<T>(_db: string, work: (conn: Connection) => Promise<T>) {
		return this.withConnection(work);
	}

	private async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
		const conn = await (await connector("oracle").pool()).getConnection();

		try {
			return await fn(conn);
		} finally {
			await conn.close();
		}
	}

	protected transaction<T>(_db: string, fn: (conn: Connection) => Promise<T>): Promise<T> {
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

	protected async rows<T = Row>(conn: Connection, sql: string, values: unknown[] = []) {
		const result = await conn.execute<T>(sql, values, {
			outFormat: loadedDriver("oracle").OUT_FORMAT_OBJECT,
			fetchTypeHandler,
		});

		return result.rows ?? [];
	}

	protected isFkViolation(e: unknown) {
		return e instanceof Error && e.message.startsWith("ORA-02292");
	}

	/** Values bind by their column's type, so a date or timestamp gets an explicit format. */
	protected override async updateTarget(conn: Connection, _db: string, tableName: string) {
		const types = await this.columnTypes(conn, tableName);

		return {
			primaryKey: await this.primaryKey(conn, tableName),
			bindValue: (column: string, value: unknown, bind: (value: unknown) => string) =>
				bindOracleValue(toOracleValue(value, types.get(column)), types.get(column), bind),
		};
	}

	protected async execute(conn: Connection, sql: string, values: unknown[] = []) {
		return (await conn.execute(sql, values)).rowsAffected ?? 0;
	}

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const { tableName, limit = 50, sort = [], order = "asc", cursor, filters = [] } = params;

		return this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);

			const columnTypes = new Map(
				columns.map((column) => [column.COLUMN_NAME, column.DATA_TYPE]),
			);

			const primaryKey = await this.primaryKey(conn, tableName);
			const tableAlias = "t";

			// ROWID breaks ties for a table without a key.
			const terms = orderTerms(
				sort,
				order,
				primaryKey.length ? primaryKey : [{ raw: `${tableAlias}.ROWID` }],
			);

			const offset = offsetOf(cursor);
			const { values, bind } = createBinds(oraclePlaceholder);

			const where = whereSql(
				buildFilterConditions(filters, bind, oracleFilters(columnTypes, bind)),
			);

			const filterValues = [...values];

			const [countRow] = await this.rows<{ total: number }>(
				conn,
				`SELECT COUNT(*) AS "total" FROM ${ident(tableName)} ${where}`,
				filterValues,
			);

			const fetched = await this.rows(
				conn,
				`SELECT ${buildOracleSelectList(columns, tableAlias)} FROM ${ident(tableName)} ${tableAlias} ${where} ${offsetOrderBy(terms, (name) => `${tableAlias}.${ident(name)}`)} OFFSET ${bind(offset)} ROWS FETCH NEXT ${bind(limit + 1)} ROWS ONLY`,
				values,
			);

			const { rows, ...page } = offsetPage(fetched, offset, limit);

			return {
				data: rows,
				meta: { limit, total: Number(countRow?.total ?? 0), ...page },
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

			const rows = await this.rows(
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

	/**
	 * An Oracle service is one database, so the list holds only the connected container
	 * (CON_NAME). Tables are the connected user's own schema.
	 */
	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const [row] = await this.rows<{
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
					size: formatFileSize(Number(row.BYTES)),
					owner: row.OWNER,
					encoding: row.ENCODING,
				},
			];
		});
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return this.withConnection(async (conn) => ({ db: await this.containerName(conn) }));
	}

	async getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		const pool = await connector("oracle").pool();

		return this.withConnection(async (conn) => {
			const [row] = await this.rows<{ U: string }>(conn, "SELECT USER AS u FROM dual");

			return {
				...server,
				user: row?.U ?? "",
				database: await this.containerName(conn),
				version: `Oracle ${conn.oracleServerVersionString}`,
				active_connections: pool.connectionsInUse,
				max_connections: pool.poolMax,
			};
		});
	}

	/** Every table is counted in one statement, on the one connection a request holds. */
	protected readonly countStatements = 1;

	/**
	 * USER_TABLES.NUM_ROWS is an estimate as of the last statistics gathering, and NULL for a
	 * table never analyzed, which is then counted.
	 */
	protected tableEstimates(conn: Connection) {
		return this.rows<TableEstimate>(
			conn,
			`SELECT table_name AS "tableName", num_rows AS "estimate" FROM user_tables
			WHERE dropped = 'NO' AND nested = 'NO' AND secondary = 'N' AND (iot_type IS NULL OR iot_type = 'IOT')
			ORDER BY table_name`,
		);
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

	/** CASCADE CONSTRAINTS drops the foreign keys of referencing tables, not their rows. */
	protected override async dropTable(
		conn: Connection,
		{ tableName, cascade }: DeleteTableParams,
	) {
		await conn.execute(
			`DROP TABLE ${ident(tableName)}${cascade ? " CASCADE CONSTRAINTS" : ""}`,
		);
	}

	async renameTable({ tableName, newTableName }: RenameTableParamsSchemaType): Promise<void> {
		this.assertDifferentTableName(tableName, newTableName);
		await this.withConnection(async (conn) => {
			await this.requireTable(conn, tableName);

			if ((await this.columns(conn, newTableName)).length)
				throw new HTTPException(409, { message: `Table "${newTableName}" already exists` });
			await conn.execute(`ALTER TABLE ${ident(tableName)} RENAME TO ${ident(newTableName)}`);
		});
	}

	async getTableSchema({ tableName }: { tableName: string }): Promise<string> {
		return this.withConnection(async (conn) => {
			await this.requireTable(conn, tableName);
			await conn.execute(
				`BEGIN
					DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', FALSE);
					DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
				END;`,
			);

			const [row] = await this.rows<{ DDL: string }>(
				conn,
				"SELECT DBMS_METADATA.GET_DDL('TABLE', :1) AS ddl FROM dual",
				[tableName],
			);

			return row?.DDL.trim() ?? "";
		});
	}

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
			this.assertColumnAbsent(await this.requireTable(conn, tableName), tableName, columnName);

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

			await this.requireColumn(conn, tableName, columnName);

			const column = (await this.columns(conn, tableName)).find(
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
			this.assertColumnAbsent(
				await this.requireColumn(conn, tableName, columnName),
				tableName,
				newColumnName,
			);
			await conn.execute(
				`ALTER TABLE ${ident(tableName)} RENAME COLUMN ${ident(columnName)} TO ${ident(newColumnName)}`,
			);
		});
	}

	async getServerLogs(): Promise<ServerLogsResult> {
		return this.withConnection(async (conn) => {
			try {
				const rows = await this.rows<{
					TS: string;
					MESSAGE_LEVEL: number;
					COMPONENT_ID: string | null;
					PROCESS_ID: string | null;
					MODULE_ID: string | null;
					MESSAGE_TEXT: string;
				}>(
					conn,
					`${SERVER_LOGS_MARKER} SELECT TO_CHAR(SYS_EXTRACT_UTC(ORIGINATING_TIMESTAMP),
						'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS TS, MESSAGE_LEVEL, COMPONENT_ID, PROCESS_ID,
						MODULE_ID, MESSAGE_TEXT
					FROM V$DIAG_ALERT_EXT
					ORDER BY ORIGINATING_TIMESTAMP DESC FETCH FIRST ${SERVER_LOGS_LIMIT} ROWS ONLY`,
				);

				return {
					available: true,
					source: "V$DIAG_ALERT_EXT (alert log)",
					entries: newestEntries(
						rows.reverse().map((row) => ({
							ts: row.TS,
							level: ORACLE_LOG_LEVELS[row.MESSAGE_LEVEL] ?? "debug",
							rawLevel: String(row.MESSAGE_LEVEL),
							source: row.COMPONENT_ID ?? undefined,
							code: /ORA-\d+/.exec(row.MESSAGE_TEXT)?.[0],
							message: row.MESSAGE_TEXT.trim(),
							detail: logDetail({ process: row.PROCESS_ID, module: row.MODULE_ID }),
						})),
					),
				};
			} catch (e) {
				if (e instanceof Error && e.message.startsWith("ORA-00942:")) {
					return logsUnavailable(
						"Reading the alert log needs: GRANT SELECT ON V_$DIAG_ALERT_EXT TO <user>; or SELECT ANY DICTIONARY.",
					);
				}

				throw e;
			}
		});
	}

	async addRecord({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const columns = Object.keys(data);

		if (!columns.length)
			throw new HTTPException(400, { message: "No data provided for insert" });

		const insertedCount = await this.transaction(db, async (conn) => {
			const types = await this.columnTypes(conn, tableName);
			const { values, bind } = createBinds(oraclePlaceholder);

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

	/** Overrides the shared delete: key values bind by their column's type. */
	override async deleteRecords({
		tableName,
		primaryKeys,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const selection: RowSelection = {
			columns: [primaryKeys[0].columnName],
			keys: primaryKeys.map((key) => [key.value]),
		};

		return this.withConnection(async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName));
			const types = await this.columnTypes(conn, tableName);

			try {
				const { values, bind } = createBinds(oraclePlaceholder);

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

				if (!this.isFkViolation(e)) throw e;
				const { values, bind } = createBinds(oraclePlaceholder);

				const where = matchesAny(selection, "p", (value, column) =>
					bindOracleValue(toOracleValue(value, types.get(column)), types.get(column), bind),
				);

				const relatedRecords = await this.rowsReferencingRows(
					conn,
					tableName,
					undefined,
					where,
					values,
				);

				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
		});
	}

	/** Deletes referencing rows children-first, then the rows themselves, in one transaction. */
	override async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
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
				const { values, bind } = createBinds(oraclePlaceholder);

				const where = matchesAny(selection, "p", (value, column) =>
					column === "ROWID"
						? `CHARTOROWID(${bind(value)})`
						: bindOracleValue(
								toOracleValue(value, types.get(column)),
								types.get(column),
								bind,
							),
				);

				const referenced = await this.rows<{ __rowid: string }>(
					conn,
					`SELECT DISTINCT ROWIDTOCHAR(c.ROWID) AS "__rowid" FROM ${ident(fk.table)} c JOIN ${ident(table)} p ON ${joinOn(fk)} WHERE ${where}`,
					values,
				);

				deleted += await purge(
					conn,
					fk.table,
					{ columns: ["ROWID"], keys: referenced.map((row) => [row.__rowid]) },
					[...path, table],
				);
			}

			const { values, bind } = createBinds(oraclePlaceholder);

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

		const deletedCount = await this.transaction(db, async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName));

			return purge(
				conn,
				tableName,
				{ columns: [primaryKeys[0].columnName], keys: primaryKeys.map((key) => [key.value]) },
				[],
			);
		});

		return { deletedCount };
	}

	async bulkInsertRecords({
		tableName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		const columns = Object.keys(records[0]);

		const successCount = await this.transaction(db, async (conn) => {
			const types = await this.columnTypes(conn, tableName);
			let expressions: string[] = [];

			const rows = records.map((record, index) => {
				const { values, bind } = createBinds(oraclePlaceholder);

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

	/**
	 * A trailing `;` is stripped from SQL (Oracle rejects it) but kept on PL/SQL blocks, where
	 * it ends the last statement; a SQL*Plus `/` line is dropped.
	 */
	protected override prepareQuery(query: string) {
		const trimmed = query
			.trim()
			.replace(/\n\s*\/$/, "")
			.trim();

		const isPlsql =
			/^(BEGIN|DECLARE|CREATE\s+(OR\s+REPLACE\s+)?((NON)?EDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE))\b/i.test(
				trimmed,
			);

		return isPlsql ? trimmed : trimmed.replace(/;\s*$/, "");
	}

	/**
	 * Native DATE and TIMESTAMP result columns are refused because Thin mode converts them to
	 * millisecond-only Date objects; callers can select them with an explicit TO_CHAR.
	 */
	protected async runStatement(conn: Connection, statement: string): Promise<StatementResult> {
		const result = await conn.execute<Row>(statement, [], {
			outFormat: loadedDriver("oracle").OUT_FORMAT_OBJECT,
			fetchTypeHandler,
			autoCommit: true,
			resultSet: true,
		});

		if (!result.resultSet) return { affected: result.rowsAffected };

		if (result.metaData?.some(isTemporalMetadata)) {
			await result.resultSet.close();
			throw new HTTPException(400, {
				message:
					"Oracle query results with native DATE or TIMESTAMP columns must use TO_CHAR with an explicit format so fractional seconds are not lost.",
			});
		}

		try {
			return {
				columns: result.metaData?.map((meta) => meta.name) ?? [],
				rows: await result.resultSet.getRows(),
			};
		} finally {
			await result.resultSet.close();
		}
	}

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

	private async containerName(conn: Connection): Promise<string> {
		const [row] = await this.rows<{ DB: string }>(
			conn,
			"SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS db FROM dual",
		);

		return row?.DB ?? "";
	}

	private columns(conn: Connection, tableName: string): Promise<ColumnRow[]> {
		return this.rows<ColumnRow>(
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

		if (!columns.length) throw this.tableMissing(tableName);

		return columns;
	}

	protected async columnNames(conn: Connection, tableName: string) {
		const columns = await this.columns(conn, tableName);

		return columns.length ? columns.map((c) => c.COLUMN_NAME) : undefined;
	}

	protected override indexError(e: Error) {
		const firstLine = e.message.split("\n")[0];

		if (startsWithAny(e, INDEX_CONFLICTS)) return { status: 409, message: firstLine };

		if (startsWithAny(e, [...CANNOT_INDEX, INDEX_IN_USE]))
			return { status: 400, message: firstLine };

		return undefined;
	}

	protected async listIndexes(
		conn: Connection,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.requireTable(conn, tableName);

		// LOB indexes are the storage of a CLOB, BLOB or JSON column: Oracle creates them with
		// the column and refuses to drop them, so they are not listed.
		const rows = await this.rows<IndexKeyRow>(
			conn,
			`SELECT i.index_name, i.index_type, i.uniqueness, ic.column_name, ic.descend, ie.column_expression,
				(SELECT MIN(c.constraint_type) FROM user_constraints c
				 WHERE c.index_name = i.index_name AND c.table_name = i.table_name AND c.constraint_type IN ('P', 'U')) AS constraint_type
			FROM user_indexes i
			JOIN user_ind_columns ic ON ic.index_name = i.index_name
			LEFT JOIN user_ind_expressions ie ON ie.index_name = ic.index_name AND ie.column_position = ic.column_position
			WHERE i.table_name = :1 AND i.table_owner = USER AND i.index_type <> 'LOB'
			ORDER BY i.index_name, ic.column_position`,
			[tableName],
		);

		const byName = new Map<
			string,
			{ index: IndexInfoSchemaType; row: IndexKeyRow; keys: string[]; hasExpression: boolean }
		>();

		for (const row of rows) {
			const entry = byName.get(row.INDEX_NAME) ?? {
				index: {
					indexName: row.INDEX_NAME,
					columns: [],
					isUnique: row.UNIQUENESS === "UNIQUE",
					method: row.INDEX_TYPE.toLowerCase(),
					kind:
						row.CONSTRAINT_TYPE === "P"
							? "primary"
							: row.CONSTRAINT_TYPE === "U"
								? "unique-constraint"
								: "index",
					definition: null,
				},
				row,
				keys: [],
				hasExpression: false,
			};

			byName.set(row.INDEX_NAME, entry);

			const direction = row.DESCEND === "DESC" ? " DESC" : "";

			// A descending key is stored as a hidden expression column holding the quoted column name.
			const plainColumn =
				row.COLUMN_EXPRESSION === null
					? row.COLUMN_NAME
					: (/^"([^"]+)"$/.exec(row.COLUMN_EXPRESSION.trim())?.[1] ?? null);

			if (plainColumn !== null) {
				entry.index.columns.push(plainColumn);
				entry.keys.push(`${ident(plainColumn)}${direction}`);
			} else {
				const expression = (row.COLUMN_EXPRESSION ?? "").trim();
				entry.index.columns.push(expression);
				entry.keys.push(`${expression}${direction}`);
				entry.hasExpression = true;
			}
		}

		// Oracle stores no CREATE INDEX text; a function-based index is rebuilt from its catalog rows.
		return [...byName.values()]
			.map(({ index, row, keys, hasExpression }) => ({
				...index,
				definition: hasExpression
					? `CREATE ${index.isUnique ? "UNIQUE " : ""}${row.INDEX_TYPE.includes("BITMAP") ? "BITMAP " : ""}INDEX ${ident(index.indexName)} ON ${ident(tableName)} (${keys.join(", ")})`
					: null,
			}))
			.sort((a, b) => Number(b.kind === "primary") - Number(a.kind === "primary"));
	}

	protected async primaryKey(conn: Connection, tableName: string): Promise<string[]> {
		const rows = await this.rows<{ COLUMN_NAME: string }>(
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
	) {
		const rows = await this.rows<{
			constraintName: string;
			table: string;
			column: string;
			referencedTable: string;
			referencedColumn: string;
		}>(
			conn,
			`SELECT c.constraint_name AS "constraintName", c.table_name AS "table", cc.column_name AS "column",
				r.table_name AS "referencedTable", rc.column_name AS "referencedColumn"
			FROM user_constraints c
			JOIN user_cons_columns cc ON cc.constraint_name = c.constraint_name
			JOIN user_constraints r ON r.constraint_name = c.r_constraint_name AND r.owner = c.r_owner
			JOIN user_cons_columns rc ON rc.constraint_name = r.constraint_name AND rc.position = cc.position
			WHERE c.constraint_type = 'R' AND ${side === "referencing" ? "c" : "r"}.table_name = :1
			ORDER BY c.constraint_name, cc.position`,
			[tableName],
		);

		return groupKeyColumns(rows);
	}

	protected referencingKeys(conn: Connection, tableName: string) {
		return this.foreignKeys(conn, "referenced", tableName);
	}

	protected override async sampleRows(
		conn: Connection,
		fk: ReferencingKey,
		rest: string,
		values: unknown[],
	) {
		const columns = await this.requireColumns(conn, fk.table);

		return this.rows(
			conn,
			`SELECT ${buildOracleSelectList(columns, "c")} FROM ${ident(fk.table)} c ${rest} FETCH FIRST ${RELATED_SAMPLE} ROWS ONLY`,
			values,
		);
	}
}
