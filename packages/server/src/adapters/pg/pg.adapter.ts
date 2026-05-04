import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
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
	ExecuteQueryResult,
	FieldDataType,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	ForeignKeyDataType,
	RelatedRecord,
	RenameColumnParamsSchemaType,
	SortDirection,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapPostgresToDataType, standardizeDataTypeLabel } from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getDbPool } from "@/adapters/connections.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
} from "./pg.query-builder.js";

type PgPool = ReturnType<typeof getDbPool>;

export class PgAdapter extends BaseAdapter {
	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
		const pool = getDbPool(db);
		const result = await pool.query(sql, values);
		return result.rows as T;
	}

	protected quoteIdentifier(name: string): string {
		return `"${name}"`;
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapPostgresToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "TEXT",
			number: "INTEGER",
			boolean: "BOOLEAN",
			json: "JSONB",
			date: "TIMESTAMP WITH TIME ZONE",
			array: "TEXT[]",
			enum: "TEXT",
		};
		return map[universalType] ?? "TEXT";
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
			db,
		} = params;

		const pool = getDbPool(db);
		void pool; // just to keep reference — actual pool used in runQuery

		let sortColumns: string[] = [];
		let effectiveSortDirection: SortDirection = order;

		if (Array.isArray(sort) && sort.length > 0) {
			sortColumns = sort.map((s) => s.columnName);
			effectiveSortDirection = sort[0].direction;
		} else if (typeof sort === "string" && sort) {
			sortColumns = [sort];
		}

		// We can't synchronously get primary key columns here (it's async).
		// The adapter overrides getTableData() to handle that step instead.
		// For cursor columns we use whatever sort columns are provided, or ctid as fallback.
		const cursorColumns = sortColumns.length > 0 ? [...sortColumns] : ["ctid"];

		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		let cursorWhere = "";
		let cursorValues: unknown[] = [];

		if (cursor) {
			const cursorData = this.decodeCursor(cursor);
			if (cursorData) {
				const res = buildCursorWhereClause(
					cursorData,
					direction,
					effectiveSortDirection,
					filterValues.length + 1,
				);
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
			} else {
				const parts = cursorColumns.map(
					(col) => `"${col}" ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`,
				);
				effectiveSortClause = `ORDER BY ${parts.join(", ")}`;
			}
		} else if (!sortClause && cursorColumns.length > 0) {
			const parts = cursorColumns.map(
				(col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`,
			);
			effectiveSortClause = `ORDER BY ${parts.join(", ")}`;
		}

		const limitParamIndex = filterValues.length + cursorValues.length + 1;
		const sql = `SELECT * FROM "${tableName}" ${combinedWhere} ${effectiveSortClause} LIMIT $${limitParamIndex}`;
		const values = [...filterValues, ...cursorValues, limit + 1];

		const countSql = `SELECT COUNT(*) as total FROM "${tableName}" ${filterWhere}`;
		const countValues = filterValues;

		return { sql, values, countSql, countValues };
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
		if (sortColumns.length === 0) sortColumns = ["ctid"];

		const createCursor = (row: NormalizedRow): string => {
			const data: CursorData = {
				values: Object.fromEntries(sortColumns.map((col) => [col, row[col]])),
				sortColumns,
			};
			return this.encodeCursor(data);
		};

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
		const pool = getDbPool(db);

		// Primary key columns for stable cursor pagination
		const pkColumns = await this.getPrimaryKeyColumns(pool, tableName);

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
		if (cursorColumns.length === 0) cursorColumns.push("ctid");

		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		let cursorWhere = "";
		let cursorValues: unknown[] = [];
		if (cursor) {
			const cursorData = this.decodeCursor(cursor);
			if (cursorData) {
				const res = buildCursorWhereClause(
					cursorData,
					direction,
					effectiveSortDirection,
					filterValues.length + 1,
				);
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
			} else {
				const parts = cursorColumns.map(
					(col) => `"${col}" ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`,
				);
				effectiveSortClause = `ORDER BY ${parts.join(", ")}`;
			}
		} else if (!sortClause && cursorColumns.length > 0) {
			const parts = cursorColumns.map(
				(col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`,
			);
			effectiveSortClause = `ORDER BY ${parts.join(", ")}`;
		}

		const countRes = await pool.query(
			`SELECT COUNT(*) as total FROM "${tableName}" ${filterWhere}`,
			filterValues,
		);
		const total = Number(countRes.rows[0].total);

		const limitParamIndex = filterValues.length + cursorValues.length + 1;
		const dataRes = await pool.query(
			`SELECT * FROM "${tableName}" ${combinedWhere} ${effectiveSortClause} LIMIT $${limitParamIndex}`,
			[...filterValues, ...cursorValues, limit + 1],
		);

		const hasColumns = dataRes.fields && dataRes.fields.length > 0;
		let rows = hasColumns
			? dataRes.rows.filter((row) => Object.keys(row).length > 0)
			: dataRes.rows;

		const hasMore = rows.length > limit;
		if (hasMore) rows = rows.slice(0, limit);
		if (direction === "desc") rows = rows.reverse();

		const createCursor = (row: Record<string, unknown>): CursorData => ({
			values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
			sortColumns: cursorColumns,
		});

		let nextCursor: string | null = null;
		let prevCursor: string | null = null;

		if (rows.length > 0) {
			const firstRow = rows[0];
			const lastRow = rows[rows.length - 1];
			if (direction === "asc") {
				if (hasMore) nextCursor = this.encodeCursor(createCursor(lastRow));
				if (cursor) prevCursor = this.encodeCursor(createCursor(firstRow));
			} else {
				if (cursor) nextCursor = this.encodeCursor(createCursor(lastRow));
				if (hasMore) prevCursor = this.encodeCursor(createCursor(firstRow));
			}
		}

		return {
			data: rows,
			meta: {
				limit,
				total,
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
		const pool = getDbPool();
		const { rows } = await pool.query(`
			SELECT
				d.datname as name,
				pg_size_pretty(pg_database_size(d.datname)) as size,
				pg_catalog.pg_get_userbyid(d.datdba) as owner,
				pg_encoding_to_char(d.encoding) as encoding
			FROM pg_catalog.pg_database d
			WHERE d.datistemplate = false
			ORDER BY d.datname;
		`);
		if (!rows[0])
			throw new HTTPException(500, { message: "No databases returned from database" });
		return rows;
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = getDbPool();
		const { rows } = await pool.query("SELECT current_database() as database;");
		if (!rows[0])
			throw new HTTPException(500, { message: "No current database returned from database" });
		return rows[0];
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const pool = getDbPool();
		const { rows } = await pool.query(`
			SELECT
				version() as version,
				current_database() as database,
				current_user as user,
				inet_server_addr() as host,
				inet_server_port() as port,
				(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
				(SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections;
		`);
		if (!rows[0])
			throw new HTTPException(500, {
				message: "No connection information returned from database",
			});

		const { connectionInfoSchema } = await import("@db-studio/shared/types");
		const result = connectionInfoSchema.parse(rows[0]);
		const urlDefaults = parseDatabaseUrl();

		return {
			host: result.host || urlDefaults.host,
			port: result.port || urlDefaults.port,
			user: result.user,
			database: result.database,
			version: result.version.toString(),
			active_connections: result.active_connections,
			max_connections: result.max_connections,
		};
	}

	// --- Tables ---

	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const pool = getDbPool(db);
		const escapeChar = (s: string) => s.replaceAll('"', '""');

		const { rows: tables } = await pool.query(`
			SELECT table_schema as "schemaName", table_name as "tableName"
			FROM information_schema.tables
			WHERE table_type = 'BASE TABLE'
				AND table_schema NOT IN ('pg_catalog', 'information_schema')
				AND table_schema NOT LIKE 'pg_toast%'
			ORDER BY table_schema, table_name;
		`);
		if (!tables[0]) return [];

		return Promise.all(
			tables.map(async (t: { schemaName: string; tableName: string }) => {
				const { rows } = await pool.query(
					`SELECT COUNT(*)::integer as count FROM "${escapeChar(t.schemaName)}"."${escapeChar(t.tableName)}"`,
				);
				return {
					schemaName: t.schemaName,
					tableName: t.tableName,
					rowCount: rows[0]?.count ?? 0,
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
		const pool = getDbPool(db);

		const columnDefs = fields.map((field: FieldDataType) => {
			let def = `"${field.columnName}" ${field.columnType}`;
			if (field.isArray) def += "[]";
			if (field.isPrimaryKey) def += " PRIMARY KEY";
			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
			if (!field.isNullable) def += " NOT NULL";
			if (field.isIdentity) def += " GENERATED ALWAYS AS IDENTITY";
			if (field.defaultValue && !field.isIdentity) def += ` DEFAULT ${field.defaultValue}`;
			return def;
		});

		const fkDefs =
			foreignKeys?.map((fk: ForeignKeyDataType) => {
				const name = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;
				return `CONSTRAINT "${name}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) ?? [];

		await pool.query(
			`CREATE TABLE "${tableName}" (\n\t\t\t\t${[...columnDefs, ...fkDefs].join(",\n\t\t\t\t")}\n\t\t\t);`,
		);
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, db, cascade } = params;
		const pool = getDbPool(db);

		const { rows: tableRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public') as exists;`,
			[tableName],
		);
		if (!tableRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const rowCount = await this.getTableRowCount(pool, tableName);

		if (!cascade) {
			const related = await this.getFkReferencesForTable(pool, tableName);
			if (related.length > 0)
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(pool, tableName),
				};
		}

		try {
			await pool.query(`DROP TABLE "${tableName}" ${cascade ? "CASCADE" : "RESTRICT"}`);
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			const pgErr = error as { code?: string };
			if (pgErr.code === "2BP01") {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(pool, tableName),
				};
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
		const pool = getDbPool(db);

		const { rows: existsRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) as exists`,
			[tableName],
		);
		if (!existsRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		interface ColumnInfo {
			column_name: string;
			data_type: string;
			udt_name: string;
			is_nullable: string;
			column_default: string | null;
			character_maximum_length: number | null;
			numeric_precision: number | null;
			numeric_scale: number | null;
		}
		interface ConstraintInfo {
			constraint_name: string;
			constraint_type: string;
			column_name: string;
			foreign_table_name: string | null;
			foreign_column_name: string | null;
		}
		interface IndexInfo {
			indexname: string;
			indexdef: string;
		}

		const { rows: columns } = await pool.query<ColumnInfo>(
			`SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
			 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
			[tableName],
		);

		const { rows: constraints } = await pool.query<ConstraintInfo>(
			`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
			 FROM information_schema.table_constraints tc
			 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
			 LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema AND tc.constraint_type = 'FOREIGN KEY'
			 WHERE tc.table_schema = 'public' AND tc.table_name = $1 ORDER BY tc.constraint_type, tc.constraint_name`,
			[tableName],
		);

		const { rows: indexes } = await pool.query<IndexInfo>(
			`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1
			 AND indexname NOT IN (SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'PRIMARY KEY')`,
			[tableName],
		);

		const formatType = (col: ColumnInfo): string => {
			const {
				data_type,
				udt_name,
				character_maximum_length,
				numeric_precision,
				numeric_scale,
			} = col;
			if (data_type === "USER-DEFINED") return udt_name;
			if (data_type === "ARRAY") return `${udt_name.replace(/^_/, "")}[]`;
			if (
				(data_type === "character varying" || data_type === "varchar") &&
				character_maximum_length
			)
				return `varchar(${character_maximum_length})`;
			if (data_type === "character" && character_maximum_length)
				return `char(${character_maximum_length})`;
			if (data_type === "numeric" && numeric_precision !== null) {
				return numeric_scale !== null && numeric_scale > 0
					? `numeric(${numeric_precision}, ${numeric_scale})`
					: `numeric(${numeric_precision})`;
			}
			if (data_type === "timestamp with time zone") return "timestamp with time zone";
			if (data_type === "timestamp without time zone") return "timestamp";
			const typeMap: Record<string, string> = {
				"character varying": "varchar",
				character: "char",
				"double precision": "float8",
				integer: "integer",
				bigint: "bigint",
				smallint: "smallint",
				boolean: "boolean",
				text: "text",
				uuid: "uuid",
				json: "json",
				jsonb: "jsonb",
				date: "date",
				time: "time",
				bytea: "bytea",
			};
			return typeMap[data_type] || data_type;
		};

		const lines: string[] = [`create table public.${tableName} (`];
		const colDefs = columns.map((col) => {
			let def = `  ${col.column_name} ${formatType(col)}`;
			if (col.is_nullable === "NO") def += " not null";
			if (col.column_default !== null) def += ` default ${col.column_default}`;
			return def;
		});

		const constraintMap = new Map<string, ConstraintInfo[]>();
		for (const c of constraints) {
			const arr = constraintMap.get(c.constraint_name) ?? [];
			arr.push(c);
			constraintMap.set(c.constraint_name, arr);
		}

		const constraintDefs: string[] = [];
		for (const [name, cols] of constraintMap) {
			const first = cols[0];
			const colNames = cols.map((c) => c.column_name).join(", ");
			if (first.constraint_type === "PRIMARY KEY") {
				constraintDefs.push(`  constraint ${name} primary key (${colNames})`);
			} else if (first.constraint_type === "FOREIGN KEY") {
				constraintDefs.push(
					`  constraint ${name} foreign key (${colNames}) references ${first.foreign_table_name} (${first.foreign_column_name})`,
				);
			} else if (first.constraint_type === "UNIQUE") {
				constraintDefs.push(`  constraint ${name} unique (${colNames})`);
			}
		}

		lines.push([...colDefs, ...constraintDefs].join(",\n"));
		lines.push(") tablespace pg_default;");

		for (const idx of indexes) {
			const isUnique = [...constraintMap.values()].some(
				(c) => c[0].constraint_type === "UNIQUE" && c[0].constraint_name === idx.indexname,
			);
			if (!isUnique) {
				lines.push("");
				lines.push(`${idx.indexdef};`);
			}
		}

		return lines.join("\n");
	}

	// --- Columns ---

	async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = getDbPool(db);
		const { rows } = await pool.query(
			`SELECT
				c.column_name as "columnName", c.data_type as "dataType", c.udt_name as "udtName",
				c.is_nullable = 'YES' as "isNullable", c.column_default as "columnDefault",
				CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey",
				CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as "isForeignKey",
				fk.referenced_table as "referencedTable", fk.referenced_column as "referencedColumn",
				CASE WHEN c.data_type = 'USER-DEFINED' THEN
					(SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = c.udt_name)
				ELSE NULL END as "enumValues"
			FROM information_schema.columns c
			LEFT JOIN (
				SELECT ku.column_name FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
				WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
			) pk ON c.column_name = pk.column_name
			LEFT JOIN (
				SELECT kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
				JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
				WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
			) fk ON c.column_name = fk.column_name
			WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position;`,
			[tableName],
		);

		if (!rows || rows.length === 0)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		return rows.map((r) => {
			let parsedEnumValues: string[] | null = null;
			if (r.enumValues) {
				if (Array.isArray(r.enumValues)) {
					parsedEnumValues = r.enumValues;
				} else if (typeof r.enumValues === "string") {
					parsedEnumValues = r.enumValues.replace(/[{}]/g, "").split(",").filter(Boolean);
				}
			}
			return {
				columnName: r.columnName,
				dataType: mapPostgresToDataType(r.dataType),
				dataTypeLabel: standardizeDataTypeLabel(r.dataType),
				isNullable: r.isNullable,
				columnDefault: r.columnDefault,
				isPrimaryKey: r.isPrimaryKey,
				isForeignKey: r.isForeignKey,
				referencedTable: r.referencedTable,
				referencedColumn: r.referencedColumn,
				enumValues: parsedEnumValues,
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
		const pool = getDbPool(db);

		const { rows: tableRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public') as exists;`,
			[tableName],
		);
		if (!tableRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public') as exists;`,
			[tableName, columnName],
		);
		if (colRows[0]?.exists)
			throw new HTTPException(409, {
				message: `Column "${columnName}" already exists in table "${tableName}"`,
			});

		let def = `"${columnName}" ${columnType}`;
		if (isArray) def += "[]";
		if (isPrimaryKey) def += " PRIMARY KEY";
		if (isUnique && !isPrimaryKey) def += " UNIQUE";
		if (!isNullable) def += " NOT NULL";
		if (isIdentity) def += " GENERATED ALWAYS AS IDENTITY";
		if (defaultValue?.trim() && !isIdentity) def += ` DEFAULT ${defaultValue.trim()}`;

		await pool.query(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, columnName, cascade, db } = params;
		const pool = getDbPool(db);

		const { rows: tableRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public') as exists;`,
			[tableName],
		);
		if (!tableRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public') as exists;`,
			[tableName, columnName],
		);
		if (!colRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		const { rowCount } = await pool.query(
			`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}" ${cascade ? "CASCADE" : "RESTRICT"}`,
		);
		return { deletedCount: rowCount ?? 0 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
		const pool = getDbPool(db);

		const { rows: tableRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public') as exists;`,
			[tableName],
		);
		if (!tableRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public') as exists;`,
			[tableName, columnName],
		);
		if (!colRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${columnType}`,
			);
			await client.query(
				`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" ${isNullable ? "DROP" : "SET"} NOT NULL`,
			);
			if (defaultValue?.trim()) {
				await client.query(
					`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue.trim()}`,
				);
			} else {
				await client.query(
					`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT`,
				);
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const pool = getDbPool(db);

		const colExistsQuery = `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public') as exists;`;

		const { rows: tableRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public') as exists;`,
			[tableName],
		);
		if (!tableRows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const { rows: curRows } = await pool.query(colExistsQuery, [tableName, columnName]);
		if (!curRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		const { rows: nextRows } = await pool.query(colExistsQuery, [tableName, newColumnName]);
		if (nextRows[0]?.exists)
			throw new HTTPException(409, {
				message: `Column "${newColumnName}" already exists in table "${tableName}"`,
			});

		await pool.query(
			`ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}"`,
		);
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
		const pool = getDbPool(db);
		const columns = Object.keys(data);
		const values = Object.values(data);
		const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const result = await pool.query(
			`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) RETURNING *`,
			values,
		);
		if (result.rowCount === 0)
			throw new HTTPException(500, { message: `Failed to insert record into "${tableName}"` });
		return { insertedCount: result.rowCount ?? 0 };
	}

	async updateRecords({
		params,
		db,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName, updates, primaryKey } = params;
		const pool = getDbPool(db);

		const updatesByRow = new Map<unknown, Array<{ columnName: string; value: unknown }>>();
		for (const u of updates) {
			const pkValue = u.rowData[primaryKey];
			if (pkValue === undefined || pkValue === null)
				throw new HTTPException(400, {
					message: `Primary key "${primaryKey}" not found in row data.`,
				});
			if (!updatesByRow.has(pkValue)) updatesByRow.set(pkValue, []);
			updatesByRow.get(pkValue)?.push({ columnName: u.columnName, value: u.value });
		}

		await pool.query("BEGIN");
		try {
			let total = 0;
			for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
				const setClauses = rowUpdates.map((u, i) => `"${u.columnName}" = $${i + 1}`);
				const values = rowUpdates.map((u) =>
					u.value !== null && typeof u.value === "object" ? JSON.stringify(u.value) : u.value,
				);
				values.push(pkValue);
				const result = await pool.query(
					`UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE "${primaryKey}" = $${values.length} RETURNING *`,
					values,
				);
				if (result.rowCount === 0)
					throw new HTTPException(404, {
						message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
					});
				total += result.rowCount ?? 0;
			}
			await pool.query("COMMIT");
			return { updatedCount: total };
		} catch (error) {
			await pool.query("ROLLBACK");
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to update records in "${tableName}"` });
		}
	}

	async deleteRecords({
		tableName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pool = getDbPool(db);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");

		try {
			await pool.query("BEGIN");
			const result = await pool.query(
				`DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${placeholders}) RETURNING *`,
				pkValues,
			);
			await pool.query("COMMIT");
			return { deletedCount: result.rowCount ?? 0, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			await pool.query("ROLLBACK");
			const pgErr = error as { code?: string };
			if (pgErr.code === "23503") {
				const relatedRecords = await this.getRelatedRecords(pool, tableName, primaryKeys, db);
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
		const pool = getDbPool(db);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });

		const pkValues = primaryKeys.map((pk) => pk.value);
		await pool.query("BEGIN");

		try {
			const fkConstraints = await this.getFkConstraints(pool, tableName);
			let totalRelated = 0;
			const deletedTables = new Set<string>();

			const deleteRelated = async (
				targetTable: string,
				targetColumn: string,
				values: unknown[],
			) => {
				const nested = await this.getFkConstraints(pool, targetTable);
				for (const nfk of nested) {
					const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
					const { rows } = await pool.query(
						`SELECT "${nfk.referencedColumn}" FROM "${targetTable}" WHERE "${targetColumn}" IN (${placeholders})`,
						values,
					);
					const nestedVals = rows.map((r: Record<string, unknown>) => r[nfk.referencedColumn]);
					if (nestedVals.length > 0)
						await deleteRelated(nfk.referencingTable, nfk.referencingColumn, nestedVals);
				}
				const ph = values.map((_, i) => `$${i + 1}`).join(", ");
				const res = await pool.query(
					`DELETE FROM "${targetTable}" WHERE "${targetColumn}" IN (${ph})`,
					values,
				);
				totalRelated += res.rowCount ?? 0;
				deletedTables.add(targetTable);
			};

			for (const c of fkConstraints) {
				if (!deletedTables.has(c.referencingTable))
					await deleteRelated(c.referencingTable, c.referencingColumn, pkValues);
			}

			const ph = pkValues.map((_, i) => `$${i + 1}`).join(", ");
			const result = await pool.query(
				`DELETE FROM "${tableName}" WHERE "${pkColumn}" IN (${ph}) RETURNING *`,
				pkValues,
			);
			await pool.query("COMMIT");
			return { deletedCount: (result.rowCount ?? 0) + totalRelated };
		} catch (error) {
			await pool.query("ROLLBACK");
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
		if (!records || records.length === 0)
			throw new HTTPException(400, { message: "At least one record is required" });

		const pool = getDbPool(db);
		const client = await pool.connect();

		try {
			const columns = Object.keys(records[0]);
			const colNames = columns.map((c) => `"${c}"`).join(", ");
			let successCount = 0;

			await client.query("BEGIN");
			for (const record of records) {
				const values = columns.map((col) => record[col]);
				const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
				try {
					await client.query(
						`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) RETURNING *`,
						values,
					);
					successCount++;
				} catch (error) {
					throw new HTTPException(500, {
						message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}
			await client.query("COMMIT");
			return {
				success: true,
				message: `Bulk insert completed: ${successCount} records inserted`,
				successCount,
				failureCount: 0,
			};
		} catch (error) {
			await client.query("ROLLBACK");
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to bulk insert records into "${tableName}"`,
			});
		} finally {
			client.release();
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
		const pool = getDbPool(db);
		if (!query?.trim()) throw new HTTPException(400, { message: "Query is required" });
		const cleaned = query.trim().replace(/;+$/, "");
		const start = performance.now();
		const result = await pool.query(cleaned);
		const duration = performance.now() - start;
		return {
			columns: result.fields.map((f) => f.name),
			rows: result.rows,
			rowCount: result.rows.length,
			duration,
			message: result.rows.length === 0 ? "OK" : undefined,
		};
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private async getPrimaryKeyColumns(pool: PgPool, tableName: string): Promise<string[]> {
		const result = await pool.query(
			`SELECT a.attname as column_name
			 FROM pg_index i
			 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
			 WHERE i.indrelid = $1::regclass AND i.indisprimary
			 ORDER BY array_position(i.indkey, a.attnum)`,
			[`"${tableName}"`],
		);
		return result.rows.map((row) => row.column_name);
	}

	private async getFkConstraints(
		pool: PgPool,
		tableName: string,
	): Promise<ForeignKeyConstraint[]> {
		const { rows } = await pool.query(
			`SELECT tc.constraint_name, tc.table_name as referencing_table, kcu.column_name as referencing_column,
				ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
			 FROM information_schema.table_constraints AS tc
			 JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
			 JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
			 WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1`,
			[tableName],
		);
		return rows.map((row: ForeignKeyConstraintRow) => ({
			constraintName: row.constraint_name,
			referencingTable: row.referencing_table,
			referencingColumn: row.referencing_column,
			referencedTable: row.referenced_table,
			referencedColumn: row.referenced_column,
		}));
	}

	private async getFkReferencesForTable(
		pool: PgPool,
		tableName: string,
	): Promise<ForeignKeyConstraint[]> {
		return this.getFkConstraints(pool, tableName);
	}

	private async getRelatedRecordsForTable(
		pool: PgPool,
		tableName: string,
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkReferencesForTable(pool, tableName);
		if (fks.length === 0) return [];
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const { rows } = await pool.query(`SELECT * FROM "${fk.referencingTable}" LIMIT 100`);
			if (rows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: rows,
				});
			}
		}
		return results;
	}

	private async getRelatedRecords(
		pool: PgPool,
		tableName: string,
		primaryKeys: DeleteRecordSchemaType["primaryKeys"],
		db: DatabaseSchemaType["db"],
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkConstraints(pool, tableName);
		if (fks.length === 0) return [];

		const results: RelatedRecord[] = [];
		const pkValues = primaryKeys.map((pk) => pk.value);
		const constraintsByTable = new Map<string, ForeignKeyConstraint[]>();
		for (const fk of fks) {
			const key = `${fk.referencingTable}.${fk.referencingColumn}`;
			const arr = constraintsByTable.get(key) ?? [];
			arr.push(fk);
			constraintsByTable.set(key, arr);
		}

		for (const [, constraints] of constraintsByTable) {
			const fk = constraints[0];
			if (!fk) continue;
			const matchingPk = primaryKeys.find((pk) => pk.columnName === fk.referencedColumn);
			if (!matchingPk) continue;
			const ph = pkValues.map((_, i) => `$${i + 1}`).join(", ");
			const { rows } = await pool.query(
				`SELECT * FROM "${fk.referencingTable}" WHERE "${fk.referencingColumn}" IN (${ph}) LIMIT 100`,
				pkValues,
			);
			if (rows.length > 0) {
				results.push({
					tableName: fk.referencingTable,
					columnName: fk.referencingColumn,
					constraintName: fk.constraintName,
					records: rows,
				});
			}
		}
		void db;
		return results;
	}

	private async getTableRowCount(pool: PgPool, tableName: string): Promise<number> {
		const { rows } = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
		return Number.parseInt(rows[0]?.count ?? "0", 10);
	}
}
