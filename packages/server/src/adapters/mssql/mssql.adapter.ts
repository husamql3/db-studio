import type {
	AlterColumnParamsSchemaType,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateIndexParamsSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteColumnParamsSchemaType,
	DeleteTableParams,
	FieldDataType,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	ServerLogEntrySchemaType,
	ServerLogsResult,
	TableDataResultSchemaType,
} from "@db-studio/shared/types";
import type { Request } from "mssql";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import type { DriverErrorClass } from "@/adapters/base.adapter.js";
import { logsUnavailable, newestEntries } from "@/adapters/server-logs.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import { offsetOf, offsetPage } from "@/adapters/sql-pagination.js";
import {
	type InlineConstraints,
	flagOrJsonTarget,
	groupKeyColumns,
	RELATED_SAMPLE,
	type ReferencingKey,
	SqlAdapter,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	buildMssqlColumnDefinition,
	buildOrderByClause,
	mssqlFilters,
	mssqlPlaceholder,
	quoteMssqlIdent,
	mapMssqlToDataType,
	standardizeMssqlDataTypeLabel,
} from "./mssql.query-builder.js";

const MSSQL_FK_VIOLATION = 547;
const MSSQL_NO_SUCH_TABLE = 208;

/** sp_readerrorlog is limited to the securityadmin role. */
const MSSQL_NOT_SECURITYADMIN = 15003;

/** The login may not EXECUTE sp_readerrorlog at all. */
const MSSQL_NO_EXECUTE_PERMISSION = 27219;

/** The login sees a table but may not SELECT from it (229) or from one of its columns (230). */
const isSelectDenied = (e: unknown) =>
	[229, 230].includes((e as { number?: number }).number ?? 0);

/** Azure SQL Database has no sp_readerrorlog. */
const MSSQL_NO_SUCH_PROCEDURE = 2812;

/** The header line the error log writes above the message of every raised error. */
const ERRORLOG_HEADER = /^Error: (\d+), Severity: (\d+), State: (\d+)\.?$/;
const MSSQL_FK_DEPENDENCY = 3726;
const MSSQL_DUP_INDEX_NAME = 1913;

/**
 * A constraint refused the row: duplicate key (2601, 2627, and 1505 when a new unique index or
 * constraint finds one), foreign key or CHECK conflict (547), NULL in a NOT NULL column (515).
 */
const MSSQL_CONSTRAINT_VIOLATIONS = new Set([515, 547, 1505, 2601, 2627]);

/**
 * A value the column cannot hold: conversion failed (241, 245, 295, 8114), out of range (220,
 * 242, 8115), too long (2628, 8152).
 */
const MSSQL_INVALID_VALUES = new Set([220, 241, 242, 245, 295, 2628, 8114, 8115, 8152]);

/** The column type cannot be an index key (1919, 1978), e.g. NVARCHAR(MAX). */
const MSSQL_CANNOT_INDEX = new Set([1919, 1978]);

/** The index enforces a constraint, or a foreign key references it. */
const MSSQL_INDEX_IN_USE = 3723;

interface IndexColumnRow {
	indexName: string;
	isUnique: boolean;
	typeDesc: string;
	isPrimaryKey: boolean;
	isUniqueConstraint: boolean;
	filterDefinition: string | null;
	columnName: string | null;
	isDescending: boolean | null;
	isIncluded: boolean | null;
}

/** A pool, or a transaction: either hands out requests. */
type MssqlConn = { request(): Request };

export class MsSqlAdapter extends SqlAdapter<MssqlConn> {
	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		const { number = 0 } = e as { number?: number };

		// Before the message check below, whose words a table name in this message can contain.
		if (e.name === "RequestError" && isSelectDenied(e)) return { status: 403 };

		// Invalid object name: dropped, renamed, or a stale URL after switching databases.
		if (e.name === "RequestError" && number === MSSQL_NO_SUCH_TABLE) return { status: 404 };

		// A login failure, connect timeout or socket error.
		if (e.name === "ConnectionError" || e.message.includes("Login failed"))
			return { status: 503 };

		if (e.name === "RequestError" && MSSQL_CONSTRAINT_VIOLATIONS.has(number))
			return { status: 409 };

		if (e.name === "RequestError" && MSSQL_INVALID_VALUES.has(number)) return { status: 400 };

		return undefined;
	}

	protected readonly quoteIdentifier = quoteMssqlIdent;
	protected readonly engine = "mssql";
	protected readonly placeholder = mssqlPlaceholder;

	protected async connect<T>(db: string, work: (conn: MssqlConn) => Promise<T>) {
		return work(await connector("mssql").pool(db));
	}

	/** A request with `values` bound as `@p0`, `@p1`, … (see `mssqlPlaceholder`). */
	private request(conn: MssqlConn, values: unknown[]) {
		const request = conn.request();
		values.forEach((value, i) => request.input(`p${i}`, value));

		return request;
	}

	protected async rows<T>(conn: MssqlConn, sql: string, values: unknown[] = []) {
		return (await this.request(conn, values).query(sql)).recordset as T[];
	}

	protected override addColumnSql(definition: string) {
		return `ADD ${definition}`;
	}

	protected async execute(conn: MssqlConn, sql: string, values: unknown[] = []) {
		return (await this.request(conn, values).query(sql)).rowsAffected[0] ?? 0;
	}

	protected async transaction<T>(db: string, work: (conn: MssqlConn) => Promise<T>) {
		const transaction = (await connector("mssql").pool(db)).transaction();
		await transaction.begin();

		try {
			const result = await work(transaction);
			await transaction.commit();

			return result;
		} catch (error) {
			await transaction.rollback().catch(() => {});
			throw error;
		}
	}

	protected isFkViolation(e: unknown) {
		return (e as { number?: number }).number === MSSQL_FK_VIOLATION;
	}

	protected override async writeTarget(_conn: MssqlConn, db: string, tableName: string) {
		return flagOrJsonTarget(await this.getTableColumns({ tableName, db }));
	}

	/** SQL Server refuses an explicit value for an identity column, so an INSERT skips it. */
	protected override async skippedInsertColumns(conn: MssqlConn, tableName: string) {
		const identity = await this.rows<{ name: string }>(
			conn,
			"SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@p0) AND is_identity = 1",
			[tableName],
		);

		return identity.map(({ name }) => name);
	}

	protected override sampleRows(
		conn: MssqlConn,
		fk: ReferencingKey,
		rest: string,
		values: unknown[],
	) {
		return this.rows<Record<string, unknown>>(
			conn,
			`SELECT TOP ${RELATED_SAMPLE} c.* FROM ${quoteMssqlIdent(fk.table)} c ${rest}`,
			values,
		);
	}

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const {
			tableName,
			db,
			limit = 50,
			sort = [],
			order = "asc",
			cursor,
			filters = [],
		} = params;

		const pool = await connector("mssql").pool(db);

		const offset = offsetOf(cursor);
		const { values, bind } = createBinds(mssqlPlaceholder);
		const filterWhere = whereSql(buildFilterConditions(filters, bind, mssqlFilters));

		const [pkColumns, { total, estimated }] = await Promise.all([
			this.primaryKey(pool, tableName),
			this.pageTotal(pool, db, tableName, undefined, filterWhere, [...values]),
		]);

		const sql = `SELECT * FROM ${quoteMssqlIdent(tableName)} ${filterWhere} ${buildOrderByClause(sort, order, pkColumns)} OFFSET ${bind(offset)} ROWS FETCH NEXT ${bind(limit + 1)} ROWS ONLY`;

		const { rows, ...page } = offsetPage(
			await this.rows<Record<string, unknown>>(pool, sql, values),
			offset,
			limit,
		);

		return {
			data: rows,
			meta: { limit, total, ...(estimated && { totalEstimated: true }), ...page },
		};
	}

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const pool = await connector("mssql").pool();

		// sys.master_files shows no rows to a login without VIEW ANY DEFINITION, so its size is
		// optional; HAS_DBACCESS drops databases the login cannot open.
		const result = await pool.request().query(`
				SELECT
				  d.name AS name,
				  ISNULL(CAST(ROUND(CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(10,2)), 2) AS VARCHAR(20)) + ' MB', '') AS size,
				  ISNULL(SUSER_SNAME(d.owner_sid), '') AS owner,
				  d.collation_name AS encoding
				FROM sys.databases d
				LEFT JOIN sys.master_files mf ON d.database_id = mf.database_id
				WHERE (d.database_id > 4 OR d.name = DB_NAME()) AND HAS_DBACCESS(d.name) = 1
				GROUP BY d.name, d.owner_sid, d.collation_name
				ORDER BY d.name
			`);

		if (!result.recordset[0]) {
			throw new HTTPException(500, { message: "No databases returned from server" });
		}

		return result.recordset as DatabaseInfoSchemaType[];
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await connector("mssql").pool();
		const result = await pool.request().query("SELECT DB_NAME() AS db");

		if (!result.recordset[0]) {
			throw new HTTPException(500, { message: "No current database returned from server" });
		}

		return result.recordset[0] as DatabaseSchemaType;
	}

	async getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		const pool = await connector("mssql").pool();

		const result = await pool.request().query(`
			SELECT
			  @@VERSION AS version,
			  DB_NAME() AS database_name,
			  SUSER_NAME() AS [user],
			  @@SERVERNAME AS host,
			  CONNECTIONPROPERTY('local_tcp_port') AS port,
			  @@MAX_CONNECTIONS AS max_connections,
			  (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS active_connections
		`);

		if (!result.recordset[0]) {
			throw new HTTPException(500, {
				message: "No connection information returned from server",
			});
		}

		const info = result.recordset[0] as Record<string, string | number>;

		return {
			host: String(info.host || server.host),
			port: Number(info.port || server.port),
			user: String(info.user),
			database: String(info.database_name ?? ""),
			version: String(info.version),
			active_connections: Number(info.active_connections ?? 0),
			max_connections: Number(info.max_connections),
		};
	}

	/** A login may see tables it cannot read; those keep their estimate. */
	protected override async exactCounts(conn: MssqlConn, tables: TableEstimate[]) {
		try {
			return await super.exactCounts(conn, tables);
		} catch (e) {
			if (!isSelectDenied(e)) throw e;
		}

		const counts: Array<number | undefined> = [];

		// super's exact count: this class's rowCount would answer a refusal with the estimate.
		for (const table of tables) {
			counts.push(
				await super.rowCount(conn, table.tableName).catch((e: unknown) => {
					if (!isSelectDenied(e)) throw e;

					return undefined;
				}),
			);
		}

		return counts;
	}

	protected columnDefinition(
		_conn: MssqlConn,
		_tableName: string,
		field: FieldDataType,
		{ inlineKey, inlineUnique }: InlineConstraints,
	) {
		return buildMssqlColumnDefinition(field, {
			includePrimaryKey: inlineKey,
			includeUnique: inlineUnique,
		});
	}

	protected override readonly keysAsTableConstraints = true;

	protected override readonly foreignKeyName = (tableName: string, fk: ForeignKeyDataType) =>
		`FK_${tableName}_${fk.columnName}`;

	/** A login may drop a table it cannot read; its estimate stands in for the count. */
	protected override async rowCount(conn: MssqlConn, tableName: string) {
		try {
			return await super.rowCount(conn, tableName);
		} catch (e) {
			if (!isSelectDenied(e)) throw e;

			return (await this.tableEstimates(conn, "", tableName))[0]?.estimate ?? 0;
		}
	}

	/**
	 * With `cascade`, the referencing foreign keys are dropped first, in the same transaction
	 * as the table, so a failed DROP TABLE keeps them.
	 */
	protected override async dropTable(
		_conn: MssqlConn,
		{ tableName, db }: DeleteTableParams,
		referencing: ReferencingKey[],
	) {
		await this.transaction(db, async (tx) => {
			for (const fk of referencing)
				await this.execute(
					tx,
					`ALTER TABLE ${quoteMssqlIdent(fk.table)} DROP CONSTRAINT ${quoteMssqlIdent(fk.constraintName)}`,
				);

			await this.execute(tx, `DROP TABLE ${quoteMssqlIdent(tableName)}`);
		});
	}

	protected override isDropRefused(e: unknown) {
		return (e as { number?: number }).number === MSSQL_FK_DEPENDENCY;
	}

	// sp_rename parses the old name, so it is quoted; the new name is taken as written.
	protected override renameTableSql(
		tableName: string,
		newTableName: string,
		_schemaName: string | undefined,
		bind: (value: unknown) => string,
	) {
		return `EXEC sp_rename ${bind(quoteMssqlIdent(tableName))}, ${bind(newTableName)}`;
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await connector("mssql").pool(db);

		await this.requireTable(pool, tableName);

		const schemaResult = await pool.request().input("tableName", tableName).query(`
				SELECT
				  c.COLUMN_NAME,
				  c.DATA_TYPE,
				  c.CHARACTER_MAXIMUM_LENGTH,
				  c.NUMERIC_PRECISION,
				  c.NUMERIC_SCALE,
				  c.IS_NULLABLE,
				  c.COLUMN_DEFAULT,
				  CASE
				    WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRIMARY KEY'
				    WHEN fk.COLUMN_NAME IS NOT NULL THEN 'FOREIGN KEY'
				    ELSE ''
				  END AS KEY_TYPE
				FROM INFORMATION_SCHEMA.COLUMNS c
				LEFT JOIN (
				  SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
				  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
				  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
				    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
				  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
				) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
				  AND c.TABLE_NAME = pk.TABLE_NAME
				  AND c.COLUMN_NAME = pk.COLUMN_NAME
				LEFT JOIN (
				  SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
				  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
				  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
				    ON rc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
				) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA
				  AND c.TABLE_NAME = fk.TABLE_NAME
				  AND c.COLUMN_NAME = fk.COLUMN_NAME
				WHERE c.TABLE_CATALOG = DB_NAME()
				  AND c.TABLE_NAME = @tableName
				  AND c.TABLE_SCHEMA = 'dbo'
				ORDER BY c.ORDINAL_POSITION
			`);

		if (!schemaResult.recordset || schemaResult.recordset.length === 0) {
			throw new HTTPException(500, {
				message: `Failed to retrieve schema for table "${tableName}"`,
			});
		}

		const columns = (
			schemaResult.recordset as Array<{
				COLUMN_NAME: string;
				DATA_TYPE: string;
				CHARACTER_MAXIMUM_LENGTH: number | null;
				NUMERIC_PRECISION: number | null;
				NUMERIC_SCALE: number | null;
				IS_NULLABLE: string;
				COLUMN_DEFAULT: string | null;
			}>
		).map((col) => {
			let colDef = `  ${quoteMssqlIdent(col.COLUMN_NAME)} ${col.DATA_TYPE}`;

			if (col.CHARACTER_MAXIMUM_LENGTH) {
				colDef +=
					col.CHARACTER_MAXIMUM_LENGTH === -1 ? "(MAX)" : `(${col.CHARACTER_MAXIMUM_LENGTH})`;
			} else if (col.NUMERIC_PRECISION !== null && col.NUMERIC_SCALE !== null) {
				colDef += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE})`;
			} else if (col.NUMERIC_PRECISION !== null) {
				colDef += `(${col.NUMERIC_PRECISION})`;
			}

			colDef += col.IS_NULLABLE === "YES" ? " NULL" : " NOT NULL";

			if (col.COLUMN_DEFAULT) colDef += ` DEFAULT ${col.COLUMN_DEFAULT}`;

			return colDef;
		});

		return `CREATE TABLE ${quoteMssqlIdent(tableName)} (\n${columns.join(",\n")}\n)`;
	}

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = await connector("mssql").pool(db);

		const result = await pool.request().input("tableName", tableName).query(`
				SELECT
				  c.COLUMN_NAME AS columnName,
				  c.DATA_TYPE AS dataType,
				  CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS isNullable,
				  c.COLUMN_DEFAULT AS columnDefault,
				  CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
				  CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isForeignKey,
				  fk.REFERENCED_TABLE_NAME AS referencedTable,
				  fk.REFERENCED_COLUMN_NAME AS referencedColumn
				FROM INFORMATION_SCHEMA.COLUMNS c
				LEFT JOIN (
				  SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
				  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
				  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
				    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
				    AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
				    AND tc.TABLE_NAME = ku.TABLE_NAME
				  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
				) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
				  AND c.TABLE_NAME = pk.TABLE_NAME
				  AND c.COLUMN_NAME = pk.COLUMN_NAME
				LEFT JOIN (
				  SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME,
				    ku2.TABLE_NAME AS REFERENCED_TABLE_NAME,
				    ku2.COLUMN_NAME AS REFERENCED_COLUMN_NAME
				  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
				  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
				    ON rc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = ku.TABLE_SCHEMA
				  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku2
				    ON rc.UNIQUE_CONSTRAINT_NAME = ku2.CONSTRAINT_NAME AND rc.UNIQUE_CONSTRAINT_SCHEMA = ku2.TABLE_SCHEMA
				) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA
				  AND c.TABLE_NAME = fk.TABLE_NAME
				  AND c.COLUMN_NAME = fk.COLUMN_NAME
				WHERE c.TABLE_CATALOG = DB_NAME()
				  AND c.TABLE_NAME = @tableName
				  AND c.TABLE_SCHEMA = 'dbo'
				ORDER BY c.ORDINAL_POSITION
			`);

		if (!result.recordset || result.recordset.length === 0) {
			throw this.tableMissing(tableName);
		}

		const checkResult = await pool.request().input("tableName", tableName).query(`
				SELECT cc.COLUMN_NAME AS columnName, chk.CHECK_CLAUSE AS checkClause
				FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS chk
				JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE cc
				  ON chk.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND cc.TABLE_SCHEMA = 'dbo'
				WHERE cc.TABLE_NAME = @tableName AND cc.TABLE_CATALOG = DB_NAME()
			`);

		const checkEnumMap = new Map<string, string[]>();

		for (const row of checkResult.recordset as { columnName: string; checkClause: string }[]) {
			const values = this.parseCheckConstraintValues(row.checkClause);

			if (values) checkEnumMap.set(row.columnName, values);
		}

		return (
			result.recordset as Array<{
				columnName: string;
				dataType: string;
				isNullable: number;
				columnDefault: string | null;
				isPrimaryKey: number;
				isForeignKey: number;
				referencedTable: string | null;
				referencedColumn: string | null;
			}>
		).map((r) => {
			const enumValues = checkEnumMap.get(r.columnName) ?? null;

			return {
				columnName: r.columnName,
				dataType: enumValues ? "enum" : mapMssqlToDataType(r.dataType),
				dataTypeLabel: enumValues ? "enum" : standardizeMssqlDataTypeLabel(r.dataType),
				isNullable: Boolean(r.isNullable),
				columnDefault: r.columnDefault ?? null,
				isPrimaryKey: Boolean(r.isPrimaryKey),
				isForeignKey: Boolean(r.isForeignKey),
				referencedTable: r.referencedTable ?? null,
				referencedColumn: r.referencedColumn ?? null,
				enumValues,
			};
		});
	}

	/**
	 * A column's DEFAULT is a named constraint, which refuses ALTER COLUMN and DROP COLUMN
	 * (errors 5074, 4922) while it stands.
	 */
	private async dropDefaultConstraint(conn: MssqlConn, tableName: string, columnName: string) {
		const [constraint] = await this.rows<{ name: string }>(
			conn,
			`SELECT dc.name FROM sys.default_constraints dc
			 JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
			 WHERE OBJECT_NAME(dc.parent_object_id) = @p0 AND c.name = @p1`,
			[tableName, columnName],
		);

		if (constraint)
			await this.execute(
				conn,
				`ALTER TABLE ${quoteMssqlIdent(tableName)} DROP CONSTRAINT ${quoteMssqlIdent(constraint.name)}`,
			);
	}

	/** 404 for a missing table or column; the column's DEFAULT goes with it. */
	override async deleteColumn({
		tableName,
		columnName,
		cascade,
		db,
	}: DeleteColumnParamsSchemaType): Promise<void> {
		await this.transaction(db, async (conn) => {
			await this.requireColumn(conn, tableName, columnName);
			await this.dropDefaultConstraint(conn, tableName, columnName);
			await this.execute(
				conn,
				`ALTER TABLE ${quoteMssqlIdent(tableName)} ${this.dropColumnSql(columnName, cascade)}`,
			);
		});
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = await connector("mssql").pool(db);

		await this.requireColumn(pool, tableName, columnName);
		await this.dropDefaultConstraint(pool, tableName, columnName);

		const nullability = isNullable ? "NULL" : "NOT NULL";
		await pool
			.request()
			.query(
				`ALTER TABLE ${quoteMssqlIdent(tableName)} ALTER COLUMN ${quoteMssqlIdent(columnName)} ${columnType} ${nullability}`,
			);

		if (defaultValue?.trim()) {
			await pool
				.request()
				.query(
					`ALTER TABLE ${quoteMssqlIdent(tableName)} ADD DEFAULT ${defaultValue.trim()} FOR ${quoteMssqlIdent(columnName)}`,
				);
		}
	}

	// sp_rename parses the old name, so its parts are quoted; the new name is taken as written.
	protected override renameColumnSql(
		tableName: string,
		columnName: string,
		newColumnName: string,
		_schemaName: string | undefined,
		bind: (value: unknown) => string,
	) {
		return `EXEC sp_rename ${bind(`${quoteMssqlIdent(tableName)}.${quoteMssqlIdent(columnName)}`)}, ${bind(newColumnName)}, 'COLUMN'`;
	}

	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const pool = await connector("mssql").pool(db);

		try {
			const result = await pool
				.request()
				.query<[{ LogDate: Date; ProcessInfo: string; Text: string }, { offset: number }]>(
					"EXEC sp_readerrorlog 0, 1; SELECT DATEDIFF(MINUTE, GETUTCDATE(), GETDATE()) AS offset",
				);

			const [log, [{ offset }]] = result.recordsets;

			// LogDate is server-local wall time, which the driver reads as if it were UTC.
			const entries: ServerLogEntrySchemaType[] = [];
			let header: { code: string; severity: number; process: string } | null = null;

			for (const row of log) {
				const match = ERRORLOG_HEADER.exec(row.Text);

				if (match) {
					header = { code: match[1], severity: Number(match[2]), process: row.ProcessInfo };
					continue;
				}

				const error = header?.process === row.ProcessInfo ? header : null;
				header = null;
				entries.push({
					ts: new Date(row.LogDate.getTime() - offset * 60_000).toISOString(),
					level: !error
						? "info"
						: error.severity >= 20
							? "fatal"
							: error.severity >= 11
								? "error"
								: "warning",
					rawLevel: error ? `Severity ${error.severity}` : "Info",
					source: row.ProcessInfo,
					code: error?.code,
					message: row.Text,
					detail: {},
				});
			}

			return { available: true, source: "sp_readerrorlog", entries: newestEntries(entries) };
		} catch (e) {
			const number = (e as { number?: number }).number;

			if (number === MSSQL_NOT_SECURITYADMIN || number === MSSQL_NO_EXECUTE_PERMISSION) {
				return logsUnavailable(
					"Reading the error log needs the securityadmin server role: ALTER SERVER ROLE securityadmin ADD MEMBER <login>;",
				);
			}

			if (number === MSSQL_NO_SUCH_PROCEDURE) {
				return logsUnavailable(
					"This server has no error log to read. Azure SQL Database keeps its logs in Azure Monitor.",
				);
			}

			throw e;
		}
	}

	protected async runStatement(conn: MssqlConn, statement: string) {
		const result = await conn.request().query(statement);

		if (!result.recordset) return { affected: result.rowsAffected[0] ?? 0 };

		const rows = result.recordset as Record<string, unknown>[];

		return {
			columns: result.recordset.columns
				? Object.keys(result.recordset.columns)
				: Object.keys(rows[0] ?? {}),
			rows,
		};
	}

	protected async referencingKeys(conn: MssqlConn, tableName: string) {
		const rows = await this.rows<{
			constraintName: string;
			table: string;
			column: string;
			referencedColumn: string;
		}>(
			conn,
			`SELECT
				fk.name AS constraintName,
				OBJECT_NAME(fk.parent_object_id) AS [table],
				COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS [column],
				COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referencedColumn
			FROM sys.foreign_keys fk
			JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
			WHERE fk.referenced_object_id = OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(@p0))
			ORDER BY [table], fk.name, fkc.constraint_column_id`,
			[tableName],
		);

		return groupKeyColumns(rows);
	}

	/**
	 * The row count SQL Server keeps for each dbo table (or only `tableName`), in name order. It
	 * is maintained with every write but documented as approximate.
	 */
	protected async tableEstimates(
		conn: MssqlConn,
		_db: string,
		tableName?: string,
	): Promise<TableEstimate[]> {
		const request = conn.request();

		if (tableName !== undefined) request.input("tableName", tableName);

		const result = await request.query<{ tableName: string; estimate: string | number }>(`
			SELECT t.name AS tableName, SUM(p.rows) AS estimate
			FROM sys.tables t
			JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
			WHERE t.schema_id = SCHEMA_ID('dbo')
				${tableName === undefined ? "" : "AND t.name = @tableName"}
			GROUP BY t.name
			ORDER BY t.name
		`);

		return result.recordset.map((row) => ({
			tableName: row.tableName,
			estimate: Number(row.estimate),
		}));
	}

	protected async primaryKey(conn: MssqlConn, tableName: string): Promise<string[]> {
		const result = await conn.request().input("tableName", tableName).query(`
				SELECT ku.COLUMN_NAME AS columnName
				FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
				JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
				  ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
				  AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
				  AND tc.TABLE_NAME = ku.TABLE_NAME
				WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
				  AND tc.TABLE_NAME = @tableName
				  AND tc.TABLE_SCHEMA = 'dbo'
				ORDER BY ku.ORDINAL_POSITION
			`);

		return (result.recordset as { columnName: string }[]).map((r) => r.columnName);
	}

	protected async columnNames(conn: MssqlConn, tableName: string) {
		const rows = await this.rows<{ name: string }>(
			conn,
			`SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @p0 AND TABLE_SCHEMA = 'dbo'
			ORDER BY ORDINAL_POSITION`,
			[tableName],
		);

		return rows.length ? rows.map((row) => row.name) : undefined;
	}

	protected override createIndexSql({
		tableName,
		indexName,
		columns,
		isUnique,
	}: CreateIndexParamsSchemaType) {
		return `CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${quoteMssqlIdent(indexName)} ON [dbo].${quoteMssqlIdent(tableName)} (${columns.map(quoteMssqlIdent).join(", ")})`;
	}

	protected override dropIndexSql(index: IndexInfoSchemaType, tableName: string) {
		return `DROP INDEX ${quoteMssqlIdent(index.indexName)} ON [dbo].${quoteMssqlIdent(tableName)}`;
	}

	protected override indexError(e: Error) {
		const { number } = e as { number?: number };

		if (number === MSSQL_DUP_INDEX_NAME) return { status: 409 };

		if (
			number === MSSQL_INDEX_IN_USE ||
			(number !== undefined && MSSQL_CANNOT_INDEX.has(number))
		)
			return { status: 400 };

		return undefined;
	}

	protected async listIndexes(
		pool: MssqlConn,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.requireTable(pool, tableName);

		// type 0 is the heap, which is the table itself rather than an index.
		const result = await pool.request().input("tableName", tableName).query<IndexColumnRow>(`
				SELECT
					i.name AS indexName,
					i.is_unique AS isUnique,
					i.type_desc AS typeDesc,
					i.is_primary_key AS isPrimaryKey,
					i.is_unique_constraint AS isUniqueConstraint,
					CASE WHEN i.has_filter = 1 THEN i.filter_definition END AS filterDefinition,
					c.name AS columnName,
					ic.is_descending_key AS isDescending,
					ic.is_included_column AS isIncluded
				FROM sys.indexes i
				LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
				LEFT JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
				WHERE i.object_id = OBJECT_ID(QUOTENAME('dbo') + '.' + QUOTENAME(@tableName))
				  AND i.type > 0 AND i.is_hypothetical = 0
				ORDER BY i.is_primary_key DESC, i.name, ic.is_included_column, ic.key_ordinal, ic.index_column_id
			`);

		const byName = new Map<
			string,
			{ index: IndexInfoSchemaType; row: IndexColumnRow; keys: string[]; included: string[] }
		>();

		for (const row of result.recordset) {
			const entry = byName.get(row.indexName) ?? {
				index: {
					indexName: row.indexName,
					columns: [],
					isUnique: row.isUnique,
					method: row.typeDesc.toLowerCase(),
					kind: row.isPrimaryKey
						? "primary"
						: row.isUniqueConstraint
							? "unique-constraint"
							: "index",
					definition: null,
				},
				row,
				keys: [],
				included: [],
			};

			byName.set(row.indexName, entry);

			if (row.columnName === null) continue;

			// SQL Server marks every columnstore column as included, not only B-tree INCLUDEs.
			if (row.isIncluded && !row.typeDesc.endsWith("COLUMNSTORE")) {
				entry.included.push(quoteMssqlIdent(row.columnName));
			} else {
				entry.index.columns.push(row.columnName);
				entry.keys.push(
					`${quoteMssqlIdent(row.columnName)}${row.isDescending ? " DESC" : ""}`,
				);
			}
		}

		// SQL Server stores no CREATE INDEX text; a filtered index is rebuilt from its catalog rows.
		return [...byName.values()].map(({ index, row, keys, included }) => ({
			...index,
			definition:
				row.filterDefinition === null
					? null
					: `CREATE ${row.isUnique ? "UNIQUE " : ""}${row.typeDesc} INDEX ${quoteMssqlIdent(row.indexName)} ON ${quoteMssqlIdent(tableName)} (${keys.join(", ")})${included.length ? ` INCLUDE (${included.join(", ")})` : ""} WHERE ${row.filterDefinition}`,
		}));
	}

	private parseCheckConstraintValues(checkClause: string): string[] | null {
		const matches = checkClause.match(/'([^']+)'/g);

		if (!matches || matches.length === 0) return null;

		return matches.map((m) => m.slice(1, -1));
	}
}
