import { HTTPException } from "hono/http-exception";
import type { ConnectionPool as MssqlPool } from "mssql";
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
	DeleteRecordSchemaType,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyDataType,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "shared/types";
import { mapMssqlToDataType, standardizeMssqlDataTypeLabel } from "shared/types";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getMssqlPool } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	buildMssqlColumnDefinition,
	buildSortClause,
	buildWhereClause,
	formatMssqlDefaultValue,
	mapColumnTypeToMssql,
} from "./mssql.query-builder.js";

const MSSQL_FK_VIOLATION = 547;
const MSSQL_FK_DEPENDENCY = 3726;

interface FkConstraintRow {
	constraint_name: string;
	referencing_table: string;
	referencing_column: string;
	referenced_table: string;
	referenced_column: string;
}

export class MsSqlAdapter extends BaseAdapter {
	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
		const pool = await getMssqlPool(db);
		const request = pool.request();
		values.forEach((val, idx) => {
			request.input(`p${idx}`, val);
		});
		const result = await request.query(sql);
		return result.recordset as T;
	}

	protected quoteIdentifier(name: string): string {
		return `[${name}]`;
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapMssqlToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "NVARCHAR(MAX)",
			number: "INT",
			boolean: "BIT",
			json: "NVARCHAR(MAX)",
			date: "DATETIME2",
			array: "NVARCHAR(MAX)",
			enum: "NVARCHAR(255)",
		};
		return map[universalType] ?? "NVARCHAR(MAX)";
	}

	protected buildTableDataQuery(params: GetTableDataParams): QueryBundle {
		const { tableName, filters = [], sort = [], order = "asc", limit = 50, cursor } = params;
		const {
			clause: filterWhere,
			values: filterValues,
			nextIdx,
		} = buildWhereClause(filters, 0);
		const sortClause = buildSortClause(sort, order) || "ORDER BY (SELECT NULL)";
		const currentOffset = cursor ? this.decodeOffsetCursor(cursor) : 0;

		const sql = `SELECT * FROM [${tableName}] ${filterWhere} ${sortClause} OFFSET @p${nextIdx} ROWS FETCH NEXT @p${nextIdx + 1} ROWS ONLY`;
		const values = [...filterValues, currentOffset, limit + 1];

		const countSql = `SELECT COUNT(*) as total FROM [${tableName}] ${filterWhere}`;
		return { sql, values, countSql, countValues: filterValues };
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(
		params: GetTableDataParams,
		_rows: NormalizedRow[],
		hasMore: boolean,
	): { nextCursor: string | null; prevCursor: string | null } {
		const { cursor, limit = 50 } = params;
		const currentOffset = cursor ? this.decodeOffsetCursor(cursor) : 0;
		return {
			nextCursor: hasMore ? this.makeCursor(currentOffset + limit) : null,
			prevCursor:
				currentOffset > 0 ? this.makeCursor(Math.max(0, currentOffset - limit)) : null,
		};
	}

	// =========================================================
	// Override getTableData for MSSQL OFFSET/FETCH pagination
	// =========================================================

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
		const pool = await getMssqlPool(db);

		const currentOffset = cursor ? this.decodeOffsetCursor(cursor) : 0;
		const {
			clause: filterWhere,
			values: filterValues,
			nextIdx,
		} = buildWhereClause(filters, 0);
		const sortClause = buildSortClause(sort, order) || "ORDER BY (SELECT NULL)";

		const countRequest = pool.request();
		filterValues.forEach((val, idx) => {
			countRequest.input(`p${idx}`, val);
		});
		const countResult = await countRequest.query(
			`SELECT COUNT(*) as total FROM [${tableName}] ${filterWhere}`,
		);
		const total = Number(countResult.recordset[0]?.total ?? 0);

		const dataRequest = pool.request();
		filterValues.forEach((val, idx) => {
			dataRequest.input(`p${idx}`, val);
		});
		dataRequest.input(`p${nextIdx}`, currentOffset);
		dataRequest.input(`p${nextIdx + 1}`, limit + 1);

		const dataResult = await dataRequest.query(
			`SELECT * FROM [${tableName}] ${filterWhere} ${sortClause} OFFSET @p${nextIdx} ROWS FETCH NEXT @p${nextIdx + 1} ROWS ONLY`,
		);

		let rows = dataResult.recordset as Record<string, unknown>[];
		const hasMore = rows.length > limit;
		if (hasMore) rows = rows.slice(0, limit);

		return {
			data: rows,
			meta: {
				limit,
				total,
				hasNextPage: hasMore,
				hasPreviousPage: currentOffset > 0,
				nextCursor: hasMore ? this.makeCursor(currentOffset + limit) : null,
				prevCursor:
					currentOffset > 0 ? this.makeCursor(Math.max(0, currentOffset - limit)) : null,
			},
		};
	}

	// =========================================================
	// IDbAdapter implementations
	// =========================================================

	// --- Databases ---

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const pool = await getMssqlPool();
		const result = await pool.request().query(`
			SELECT
			  d.name AS name,
			  CAST(ROUND(CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(10,2)), 2) AS VARCHAR(20)) + ' MB' AS size,
			  SUSER_SNAME(d.owner_sid) AS owner,
			  d.collation_name AS encoding
			FROM sys.databases d
			JOIN sys.master_files mf ON d.database_id = mf.database_id
			WHERE d.database_id > 4
			GROUP BY d.name, d.owner_sid, d.collation_name
			ORDER BY d.name
		`);
		if (!result.recordset[0]) {
			throw new HTTPException(500, { message: "No databases returned from server" });
		}
		return result.recordset as DatabaseInfoSchemaType[];
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await getMssqlPool();
		const result = await pool.request().query("SELECT DB_NAME() AS db");
		if (!result.recordset[0]) {
			throw new HTTPException(500, { message: "No current database returned from server" });
		}
		return result.recordset[0] as DatabaseSchemaType;
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const pool = await getMssqlPool();
		const result = await pool.request().query(`
			SELECT
			  @@VERSION AS version,
			  DB_NAME() AS database_name,
			  SUSER_NAME() AS [user],
			  @@SERVERNAME AS host,
			  (SELECT local_tcp_port FROM sys.dm_exec_connections WHERE session_id = @@SPID) AS port,
			  @@MAX_CONNECTIONS AS max_connections,
			  (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS active_connections
		`);
		if (!result.recordset[0]) {
			throw new HTTPException(500, {
				message: "No connection information returned from server",
			});
		}
		const info = result.recordset[0] as Record<string, string | number>;
		const urlDefaults = parseDatabaseUrl();
		return {
			host: String(info.host || urlDefaults.host),
			port: Number(info.port || urlDefaults.port),
			user: String(info.user),
			database: String(info.database_name ?? ""),
			version: String(info.version),
			active_connections: Number(info.active_connections ?? 0),
			max_connections: Number(info.max_connections),
		};
	}

	// --- Tables ---

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const pool = await getMssqlPool(db);
		const result = await pool.request().query(`
			SELECT table_name AS tableName
			FROM information_schema.tables
			WHERE table_catalog = DB_NAME()
			  AND table_type = 'BASE TABLE'
			  AND table_schema = 'dbo'
			ORDER BY table_name
		`);
		if (!result.recordset || result.recordset.length === 0) return [];

		return Promise.all(
			(result.recordset as Array<{ tableName: string }>).map(async (table) => {
				const countResult = await pool
					.request()
					.query(`SELECT COUNT(*) as count FROM [${table.tableName}]`);
				return {
					tableName: table.tableName,
					rowCount: (countResult.recordset[0] as { count: number })?.count ?? 0,
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
		const pool = await getMssqlPool(db);

		const columnDefs = fields.map((field: FieldDataType) => {
			const mappedType = mapColumnTypeToMssql(field.columnType, field.isArray ?? false);
			let colDef = `[${field.columnName}] ${mappedType}`;
			if (!field.isNullable && !field.isPrimaryKey) colDef += " NOT NULL";
			if (field.defaultValue && !mappedType.includes("IDENTITY")) {
				const dv = formatMssqlDefaultValue(field.defaultValue, mappedType);
				if (dv !== null) colDef += ` DEFAULT ${dv}`;
			}
			return colDef;
		});

		const constraintDefs: string[] = [];
		const primaryKeyFields = fields.filter((f: FieldDataType) => f.isPrimaryKey);
		if (primaryKeyFields.length > 0) {
			constraintDefs.push(
				`PRIMARY KEY (${primaryKeyFields.map((f: FieldDataType) => `[${f.columnName}]`).join(", ")})`,
			);
		}
		for (const field of fields as FieldDataType[]) {
			if (field.isUnique && !field.isPrimaryKey) {
				constraintDefs.push(`UNIQUE ([${field.columnName}])`);
			}
		}

		const fkDefs =
			foreignKeys?.map((fk: ForeignKeyDataType) => {
				const name = `FK_${tableName}_${fk.columnName}`;
				return `CONSTRAINT [${name}] FOREIGN KEY ([${fk.columnName}]) REFERENCES [${fk.referencedTable}] ([${fk.referencedColumn}]) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) ?? [];

		await pool
			.request()
			.query(
				`CREATE TABLE [${tableName}] (\n\t\t\t${[...columnDefs, ...constraintDefs, ...fkDefs].join(",\n\t\t\t")}\n\t\t)`,
			);
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, db, cascade } = params;
		const pool = await getMssqlPool(db);

		const tableCheck = await pool
			.request()
			.input("tableName", tableName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(tableCheck.recordset[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const rowCount = await this.getTableRowCount(tableName, db);

		if (!cascade) {
			const relatedRecords = await this.getRelatedRecordsForTable(tableName, db);
			if (relatedRecords.length > 0) {
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
		}

		try {
			if (cascade) {
				const fkConstraints = await this.getForeignKeyReferences(tableName, db);
				for (const fk of fkConstraints) {
					await pool
						.request()
						.query(
							`ALTER TABLE [${fk.referencingTable}] DROP CONSTRAINT [${fk.constraintName}]`,
						);
				}
			}
			await pool.request().query(`DROP TABLE [${tableName}]`);
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error: unknown) {
			const mssqlError = error as { number?: number };
			if (mssqlError.number === MSSQL_FK_DEPENDENCY) {
				const relatedRecords = await this.getRelatedRecordsForTable(tableName, db);
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to delete table "${tableName}"` });
		}
	}

	async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await getMssqlPool(db);

		const tableCheck = await pool
			.request()
			.input("tableName", tableName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(tableCheck.recordset[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const schemaResult = await pool
			.request()
			.input("tableName", tableName)
			.query(`
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
			let colDef = `  [${col.COLUMN_NAME}] ${col.DATA_TYPE}`;
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

		return `CREATE TABLE [${tableName}] (\n${columns.join(",\n")}\n)`;
	}

	// --- Columns ---

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = await getMssqlPool(db);

		const result = await pool
			.request()
			.input("tableName", tableName)
			.query(`
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
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}

		const checkResult = await pool
			.request()
			.input("tableName", tableName)
			.query(`
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
			db,
		} = params;
		const pool = await getMssqlPool(db);

		await this.assertTableExists(pool, tableName);

		const colCheck = await pool
			.request()
			.input("tableName", tableName)
			.input("columnName", columnName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(colCheck.recordset[0]?.cnt ?? 0) > 0) {
			throw new HTTPException(409, {
				message: `Column "${columnName}" already exists in table "${tableName}"`,
			});
		}

		const colDef = buildMssqlColumnDefinition(
			{ columnName, columnType, defaultValue, isPrimaryKey, isNullable, isUnique, isIdentity },
			{ includePrimaryKey: true, includeUnique: true },
		);
		await pool.request().query(`ALTER TABLE [${tableName}] ADD ${colDef}`);
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, columnName, db } = params;
		const pool = await getMssqlPool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const result = await pool
			.request()
			.query(`ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`);
		return { deletedCount: result.rowsAffected[0] ?? 1 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = await getMssqlPool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const defaultConstraintResult = await pool
			.request()
			.input("tableName", tableName)
			.input("columnName", columnName)
			.query(`
				SELECT dc.name AS constraint_name
				FROM sys.default_constraints dc
				JOIN sys.columns c
				  ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
				WHERE OBJECT_NAME(dc.parent_object_id) = @tableName AND c.name = @columnName
			`);
		const constraintName = defaultConstraintResult.recordset[0]?.constraint_name as
			| string
			| undefined;
		if (constraintName) {
			await pool
				.request()
				.query(`ALTER TABLE [${tableName}] DROP CONSTRAINT [${constraintName}]`);
		}

		const nullability = isNullable ? "NULL" : "NOT NULL";
		await pool
			.request()
			.query(
				`ALTER TABLE [${tableName}] ALTER COLUMN [${columnName}] ${columnType} ${nullability}`,
			);

		if (defaultValue?.trim()) {
			await pool
				.request()
				.query(
					`ALTER TABLE [${tableName}] ADD DEFAULT ${defaultValue.trim()} FOR [${columnName}]`,
				);
		}
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const pool = await getMssqlPool(db);

		await this.assertTableExists(pool, tableName);
		await this.assertColumnExists(pool, tableName, columnName);

		const newColCheck = await pool
			.request()
			.input("tableName", tableName)
			.input("columnName", newColumnName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(newColCheck.recordset[0]?.cnt ?? 0) > 0) {
			throw new HTTPException(409, {
				message: `Column "${newColumnName}" already exists in table "${tableName}"`,
			});
		}

		await pool
			.request()
			.query(`EXEC sp_rename '${tableName}.${columnName}', '${newColumnName}', 'COLUMN'`);
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
		const pool = await getMssqlPool(db);

		const booleanColumns = await this.getBooleanColumnSet(tableName, db);

		const identityResult = await pool
			.request()
			.input("tableName", tableName)
			.query(
				`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@tableName) AND is_identity = 1`,
			);
		const identityColumns = new Set(
			(identityResult.recordset as { name: string }[]).map((r) => r.name),
		);

		const columns = Object.keys(data).filter((col) => !identityColumns.has(col));
		const values = columns.map((col) => {
			const value = data[col];
			if (booleanColumns.has(col) && typeof value === "string") {
				return value === "true" ? 1 : 0;
			}
			return value;
		});

		const columnNames = columns.map((col) => `[${col}]`).join(", ");
		const paramNames = columns.map((_col, idx) => `@param${idx}`).join(", ");

		const request = pool.request();
		columns.forEach((_col, idx) => {
			request.input(`param${idx}`, values[idx]);
		});

		const result = await request.query(
			`INSERT INTO [${tableName}] (${columnNames}) VALUES (${paramNames})`,
		);
		if (result.rowsAffected[0] === 0) {
			throw new HTTPException(500, { message: `Failed to insert record into "${tableName}"` });
		}
		return { insertedCount: result.rowsAffected[0] ?? 0 };
	}

	async updateRecords({
		params,
		db,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName, updates, primaryKey } = params;
		const pool = await getMssqlPool(db);

		const booleanColumns = await this.getBooleanColumnSet(tableName, db);

		const updatesByRow = new Map<unknown, Array<{ columnName: string; value: unknown }>>();
		for (const update of updates) {
			const pkValue = update.rowData[primaryKey];
			if (pkValue === undefined || pkValue === null) {
				throw new HTTPException(400, {
					message: `Primary key "${primaryKey}" not found in row data.`,
				});
			}
			if (!updatesByRow.has(pkValue)) updatesByRow.set(pkValue, []);
			updatesByRow.get(pkValue)?.push({ columnName: update.columnName, value: update.value });
		}

		const transaction = pool.transaction();
		await transaction.begin();

		try {
			let total = 0;
			for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
				const request = transaction.request();
				const setClauses = rowUpdates.map((u, idx) => `[${u.columnName}] = @value${idx}`);

				rowUpdates.forEach((u, idx) => {
					let value = u.value;
					if (value !== null && typeof value === "object") value = JSON.stringify(value);
					if (booleanColumns.has(u.columnName) && typeof value === "string") {
						value = value === "true" ? 1 : 0;
					}
					request.input(`value${idx}`, value);
				});
				request.input("pkValue", pkValue);

				const result = await request.query(
					`UPDATE [${tableName}] SET ${setClauses.join(", ")} WHERE [${primaryKey}] = @pkValue`,
				);
				if (result.rowsAffected[0] === 0) {
					throw new HTTPException(404, {
						message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
					});
				}
				total += result.rowsAffected[0] ?? 0;
			}
			await transaction.commit();
			return { updatedCount: total };
		} catch (error) {
			await transaction.rollback();
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to update records in "${tableName}"` });
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pool = await getMssqlPool(db);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		const transaction = pool.transaction();
		await transaction.begin();

		try {
			const request = transaction.request();
			pkValues.forEach((value, idx) => {
				request.input(`pk${idx}`, value);
			});
			const paramList = pkValues.map((_, idx) => `@pk${idx}`).join(", ");

			const result = await request.query(
				`DELETE FROM [${tableName}] WHERE [${pkColumn}] IN (${paramList})`,
			);
			await transaction.commit();
			return {
				deletedCount: result.rowsAffected[0] ?? 0,
				fkViolation: false,
				relatedRecords: [],
			};
		} catch (error: unknown) {
			await transaction.rollback();
			const mssqlError = error as { number?: number };
			if (mssqlError.number === MSSQL_FK_VIOLATION) {
				const relatedRecords = await this.getRelatedRecords(tableName, primaryKeys, db);
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to delete records from "${tableName}"`,
			});
		}
	}

	async forceDeleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pool = await getMssqlPool(db);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		const transaction = pool.transaction();
		await transaction.begin();

		try {
			const fkConstraints = await this.getForeignKeyReferences(tableName, db);
			let totalRelated = 0;
			const deletedTables = new Set<string>();
			const visited = new Set<string>();

			const deleteRelatedRecursively = async (
				targetTable: string,
				targetColumn: string,
				values: unknown[],
				visitedSet: Set<string>,
			) => {
				const key = `${targetTable}.${targetColumn}`;
				if (visitedSet.has(key)) return;
				visitedSet.add(key);

				const nestedFks = await this.getForeignKeyReferences(targetTable, db);
				for (const nestedFk of nestedFks) {
					const selectRequest = transaction.request();
					values.forEach((val, idx) => {
						selectRequest.input(`val${idx}`, val);
					});
					const selectParamList = values.map((_, idx) => `@val${idx}`).join(", ");

					const selectResult = await selectRequest.query(
						`SELECT [${nestedFk.referencedColumn}] FROM [${targetTable}] WHERE [${targetColumn}] IN (${selectParamList})`,
					);
					const nestedValues = (selectResult.recordset as Record<string, unknown>[]).map(
						(row) => row[nestedFk.referencedColumn],
					);
					if (nestedValues.length > 0) {
						await deleteRelatedRecursively(
							nestedFk.referencingTable,
							nestedFk.referencingColumn,
							nestedValues,
							visitedSet,
						);
					}
				}

				const deleteRequest = transaction.request();
				values.forEach((val, idx) => {
					deleteRequest.input(`delVal${idx}`, val);
				});
				const deleteParamList = values.map((_, idx) => `@delVal${idx}`).join(", ");

				const deleteResult = await deleteRequest.query(
					`DELETE FROM [${targetTable}] WHERE [${targetColumn}] IN (${deleteParamList})`,
				);
				totalRelated += deleteResult.rowsAffected[0] ?? 0;
				deletedTables.add(targetTable);
			};

			for (const constraint of fkConstraints) {
				if (!deletedTables.has(constraint.referencingTable)) {
					await deleteRelatedRecursively(
						constraint.referencingTable,
						constraint.referencingColumn,
						pkValues,
						visited,
					);
				}
			}

			const mainRequest = transaction.request();
			pkValues.forEach((val, idx) => {
				mainRequest.input(`mainPk${idx}`, val);
			});
			const mainParamList = pkValues.map((_, idx) => `@mainPk${idx}`).join(", ");

			const result = await mainRequest.query(
				`DELETE FROM [${tableName}] WHERE [${pkColumn}] IN (${mainParamList})`,
			);
			await transaction.commit();
			return { deletedCount: (result.rowsAffected[0] ?? 0) + totalRelated };
		} catch (error) {
			await transaction.rollback();
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to force delete records from "${tableName}"`,
			});
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

		const pool = await getMssqlPool(db);
		const transaction = pool.transaction();

		try {
			const columns = Object.keys(records[0]);
			const columnNames = columns.map((col) => `[${col}]`).join(", ");
			const booleanColumns = await this.getBooleanColumnSet(tableName, db);

			await transaction.begin();

			for (let i = 0; i < records.length; i++) {
				const record = records[i];
				const request = transaction.request();
				const values = columns.map((col) => {
					const value = record[col];
					if (booleanColumns.has(col) && typeof value === "string") {
						return value === "true" ? 1 : 0;
					}
					return value;
				});

				const paramNames = columns.map((_, idx) => `@p${i}_${idx}`).join(", ");
				columns.forEach((_col, idx) => {
					request.input(`p${i}_${idx}`, values[idx]);
				});

				try {
					await request.query(
						`INSERT INTO [${tableName}] (${columnNames}) VALUES (${paramNames})`,
					);
				} catch (error) {
					throw new HTTPException(500, {
						message: `Failed to insert record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}

			await transaction.commit();
			return {
				success: true,
				message: `Successfully inserted ${records.length} record${records.length !== 1 ? "s" : ""}`,
				successCount: records.length,
				failureCount: 0,
			};
		} catch (error) {
			await transaction.rollback();
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to bulk insert records into "${tableName}"`,
			});
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
		const pool = await getMssqlPool(db);
		if (!query?.trim()) throw new HTTPException(400, { message: "Query is required" });

		const cleanedQuery = query.trim().replace(/;+$/, "");
		const start = performance.now();
		const result = await pool.request().query(cleanedQuery);
		const duration = performance.now() - start;

		if (result.recordset) {
			const rows = result.recordset as Record<string, unknown>[];
			const columns = result.recordset.columns
				? Object.keys(result.recordset.columns)
				: Object.keys(rows[0] ?? {});
			return {
				columns,
				rows,
				rowCount: rows.length,
				duration,
				message: rows.length === 0 ? "OK" : undefined,
			};
		}

		return {
			columns: [],
			rows: [],
			rowCount: result.rowsAffected[0] ?? 0,
			duration,
			message: `OK — ${result.rowsAffected[0] ?? 0} row(s) affected`,
		};
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private async getForeignKeyReferences(
		tableName: string,
		db: string,
	): Promise<ForeignKeyConstraint[]> {
		const pool = await getMssqlPool(db);
		const result = await pool
			.request()
			.input("tableName", tableName)
			.query(`
				SELECT
				  fk.name AS constraint_name,
				  OBJECT_NAME(fk.parent_object_id) AS referencing_table,
				  COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS referencing_column,
				  OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
				  COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
				FROM sys.foreign_keys fk
				INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
				WHERE OBJECT_NAME(fk.referenced_object_id) = @tableName
			`);
		return (result.recordset as FkConstraintRow[]).map((row) => ({
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
		const pool = await getMssqlPool(db);
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const relatedResult = await pool
				.request()
				.query(`SELECT TOP 100 * FROM [${fk.referencingTable}]`);
			if (relatedResult.recordset.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: relatedResult.recordset as Record<string, unknown>[],
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
		const pool = await getMssqlPool(db);
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

			const request = pool.request();
			pkValues.forEach((value, idx) => {
				request.input(`pk${idx}`, value);
			});
			const paramList = pkValues.map((_, idx) => `@pk${idx}`).join(", ");

			const relatedResult = await request.query(
				`SELECT TOP 100 * FROM [${fk.referencingTable}] WHERE [${fk.referencingColumn}] IN (${paramList})`,
			);
			if (relatedResult.recordset.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: relatedResult.recordset as Record<string, unknown>[],
				});
			}
		}
		return results;
	}

	private async getTableRowCount(tableName: string, db: string): Promise<number> {
		const pool = await getMssqlPool(db);
		const result = await pool.request().query(`SELECT COUNT(*) as count FROM [${tableName}]`);
		return Number(result.recordset[0]?.count ?? 0);
	}

	private async getBooleanColumnSet(tableName: string, db: string): Promise<Set<string>> {
		const cols = await this.getTableColumns({ tableName, db });
		return new Set(cols.filter((c) => c.dataTypeLabel === "boolean").map((c) => c.columnName));
	}

	private async assertTableExists(pool: MssqlPool, tableName: string): Promise<void> {
		const result = await pool
			.request()
			.input("tableName", tableName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(result.recordset[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		}
	}

	private async assertColumnExists(
		pool: MssqlPool,
		tableName: string,
		columnName: string,
	): Promise<void> {
		const result = await pool
			.request()
			.input("tableName", tableName)
			.input("columnName", columnName)
			.query(`
				SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
				WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName AND TABLE_SCHEMA = 'dbo'
			`);
		if (Number(result.recordset[0]?.cnt ?? 0) === 0) {
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		}
	}

	private parseCheckConstraintValues(checkClause: string): string[] | null {
		const matches = checkClause.match(/'([^']+)'/g);
		if (!matches || matches.length === 0) return null;
		return matches.map((m) => m.slice(1, -1));
	}

	private makeCursor(offset: number): string {
		return this.encodeCursor({ values: { _offset: offset }, sortColumns: ["_offset"] });
	}

	private decodeOffsetCursor(cursor: string): number {
		const data = this.decodeCursor(cursor);
		return Number(data?.values._offset ?? 0);
	}
}
