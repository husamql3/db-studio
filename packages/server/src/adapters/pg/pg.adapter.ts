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
	ServerLogsResult,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import {
	DATABASE_ENGINES,
	mapPostgresToDataType,
	standardizeDataTypeLabel,
} from "@db-studio/shared/types";
import type { PoolClient } from "pg";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	BaseAdapter,
	EXACT_COUNT_LIMIT,
	type NormalizedRow,
	type QueryBundle,
} from "@/adapters/base.adapter.js";
import { getConnectionUrl, getDbPool } from "@/adapters/connections.js";
import { logsUnavailable, newestEntries, SERVER_LOGS_MARKER } from "@/adapters/server-logs.js";
import { isPgConstraintViolation, isPgDatabaseError, isPgDataException } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import { type PgLogFormat, parsePgLog } from "./pg.log-parser.js";
import {
	buildKeysetPredicate,
	buildOrderBy,
	buildWhereClause,
	type OrderTerm,
	qualifiedTable,
	schemaOf,
} from "./pg.query-builder.js";

type PgPool = Awaited<ReturnType<typeof getDbPool>>;
/** A pool, or one connection checked out of it for a transaction. */
type PgQueryable = Pick<PgPool, "query">;

/**
 * Runs `work` inside BEGIN/COMMIT on one checked-out connection. `pool.query` may hand each
 * statement a different connection, so BEGIN, the writes and ROLLBACK could land apart.
 */
const inTransaction = async <T>(pool: PgPool, work: (client: PoolClient) => Promise<T>) => {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await work(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
};

/** Bytes read from the end of the log file; enough for several hundred entries. */
const LOG_TAIL_BYTES = 1024 * 1024;

export class PgAdapter extends BaseAdapter {
	// Keyed by pool: tabs can work with a PostgreSQL and a CockroachDB server at once.
	private databaseSizeSupport = new WeakMap<PgPool, Promise<boolean>>();

	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
		const pool = await getDbPool(db);
		const result = await pool.query(sql, values);
		return result.rows as T;
	}

	protected quoteIdentifier(name: string): string {
		return `"${name.replaceAll('"', '""')}"`;
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

	// getTableData is overridden below: paging needs the primary key, which takes a query.
	protected buildTableDataQuery(): QueryBundle {
		throw new Error("PgAdapter builds table data queries in getTableData");
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Record<string, unknown>[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(): { nextCursor: string | null; prevCursor: string | null } {
		throw new Error("PgAdapter builds cursors in getTableData");
	}

	// =========================================================
	// Override getTableData to incorporate primary-key cursor columns
	// =========================================================

	override async getTableData(params: GetTableDataParams) {
		const {
			tableName,
			schemaName,
			db,
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			cursor,
			filters = [],
		} = params;
		const pool = await getDbPool(db);
		const table = qualifiedTable(tableName, schemaName);
		const { clause: filterWhere, values: filterValues } = buildWhereClause(filters);

		// Primary key columns keep cursor pagination stable. The total does not depend on them or
		// on the page, so it is counted at the same time instead of after. These are the first
		// queries to touch the table, so a dropped table or a stale URL fails here.
		const [pkColumns, { total, estimated }] = await Promise.all([
			this.getPrimaryKeyColumns(pool, table),
			this.countRows(pool, table, filterWhere, filterValues),
		]).catch((e: unknown) => {
			if (isPgDatabaseError(e) && e.code === "42P01")
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
			throw this.wrapError(e);
		});

		const sortTerms: OrderTerm[] = Array.isArray(sort)
			? sort.map((s) => ({ column: s.columnName, direction: s.direction }))
			: sort
				? [{ column: sort, direction: order }]
				: [];
		// The key breaks ties between equal sort values, so every row has one place in the order.
		const keyColumns = pkColumns.length ? pkColumns : ["ctid"];
		const keyDirection = sortTerms[0]?.direction ?? order;
		const terms = [
			...sortTerms,
			...keyColumns
				.filter((key) => !sortTerms.some((term) => term.column === key))
				.map((column) => ({ column, direction: keyDirection })),
		];
		const cursorColumns = terms.map((term) => term.column);
		const backward = direction === "desc";

		const cursorData = cursor ? this.decodeCursor(cursor) : null;
		const { clause: cursorWhere, values: cursorValues } = cursorData
			? buildKeysetPredicate(terms, cursorData.values, backward, filterValues.length + 1)
			: { clause: "", values: [] };

		const where = [filterWhere.replace(/^WHERE\s+/i, ""), cursorWhere].filter(Boolean);
		const combinedWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";

		// SELECT * omits ctid and CockroachDB's hidden rowid primary key. Primary key columns are
		// selected explicitly; ctid is a reserved system column name, so selecting it by name
		// cannot shadow a user column.
		const usesCtid = cursorColumns.includes("ctid");
		const extraSelect = [
			...pkColumns.map((col) => this.quoteIdentifier(col)),
			...(usesCtid ? ["ctid"] : []),
		];

		const limitParamIndex = filterValues.length + cursorValues.length + 1;
		const dataRes = await pool.query(
			`SELECT ${["*", ...extraSelect].join(", ")} FROM ${table} ${combinedWhere} ${buildOrderBy(terms, backward)} LIMIT $${limitParamIndex}`,
			[...filterValues, ...cursorValues, limit + 1],
		);

		let rawRows: Record<string, unknown>[] = dataRes.rows;
		const hasMore = rawRows.length > limit;
		if (hasMore) rawRows = rawRows.slice(0, limit);
		if (direction === "desc") rawRows = rawRows.reverse();

		const rows = rawRows
			.map((row) => {
				if (!usesCtid) return row;
				const { ctid: _ctid, ...rest } = row;
				return rest;
			})
			.filter((row) => Object.keys(row).length > 0);

		const createCursor = (row: Record<string, unknown>): CursorData => ({
			values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
			sortColumns: cursorColumns,
		});

		let nextCursor: string | null = null;
		let prevCursor: string | null = null;

		if (rawRows.length > 0) {
			const firstRow = rawRows[0];
			const lastRow = rawRows[rawRows.length - 1];
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
				...(estimated && { totalEstimated: true }),
				hasNextPage: direction === "asc" ? hasMore : !!cursor,
				hasPreviousPage: direction === "asc" ? !!cursor : hasMore,
				nextCursor,
				prevCursor,
			},
		};
	}

	/**
	 * Rows matching the filters. Unfiltered, a table the planner estimates at EXACT_COUNT_LIMIT
	 * rows or more reports that estimate, because an exact count reads the whole table and the
	 * total is fetched with every page.
	 */
	private async countRows(
		pool: PgPool,
		table: string,
		filterWhere: string,
		filterValues: unknown[],
	): Promise<{ total: number; estimated: boolean }> {
		if (filterWhere) {
			const { rows } = await pool.query(
				`SELECT COUNT(*) as total FROM ${table} ${filterWhere}`,
				filterValues,
			);
			return { total: Number(rows[0].total), estimated: false };
		}
		// The COUNT(*) subquery only runs when the CASE reaches it.
		const { rows } = await pool.query(
			`SELECT CASE WHEN reltuples >= $1 THEN reltuples::bigint
					ELSE (SELECT COUNT(*) FROM ${table}) END as total,
				reltuples >= $1 as estimated
			FROM pg_catalog.pg_class WHERE oid = $2::regclass`,
			[EXACT_COUNT_LIMIT, table],
		);
		return { total: Number(rows[0].total), estimated: rows[0].estimated === true };
	}

	// =========================================================
	// IDbAdapter implementations
	// =========================================================

	// --- Databases ---

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const pool = await getDbPool();
			const size = (await this.supportsDatabaseSize(pool))
				? "pg_size_pretty(pg_database_size(d.datname))"
				: "'unknown'";
			const { rows } = await pool.query(`
				SELECT
					d.datname as name,
					${size} as size,
					pg_catalog.pg_get_userbyid(d.datdba) as owner,
					pg_encoding_to_char(d.encoding) as encoding
				FROM pg_catalog.pg_database d
				WHERE d.datistemplate = false
					AND (d.datname NOT IN ('postgres', 'rdsadmin') OR d.datname = current_database())
				ORDER BY d.datname;
			`);
			if (!rows[0])
				throw new HTTPException(500, { message: "No databases returned from database" });
			return rows;
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await getDbPool();
		const { rows } = await pool.query<DatabaseSchemaType>("SELECT current_database() AS db;");
		if (!rows[0])
			throw new HTTPException(500, { message: "No current database returned from database" });
		return rows[0];
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const pool = await getDbPool();
		const { rows } = await pool.query(`
			SELECT
				version() as version,
				current_database() as database,
				current_user as user,
				inet_server_addr() as host,
				inet_server_port()::int4 as port,
				(SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
				(SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections;
		`);
		if (!rows[0])
			throw new HTTPException(500, {
				message: "No connection information returned from database",
			});

		const { connectionInfoSchema } = await import("@db-studio/shared/types");
		const result = connectionInfoSchema.parse(rows[0]);
		const urlDefaults = parseDatabaseUrl(getConnectionUrl());

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
		const pool = await getDbPool(db);
		const escapeChar = (s: string) => s.replaceAll('"', '""');

		// reltuples is the planner's row estimate, which autovacuum keeps current; it is -1 (0
		// before PostgreSQL 14) for a table never analyzed.
		const { rows: tables } = await pool.query<{
			schemaName: string;
			tableName: string;
			estimate: number;
		}>(`
			SELECT t.table_schema as "schemaName", t.table_name as "tableName", c.reltuples as "estimate"
			FROM information_schema.tables t
			JOIN pg_catalog.pg_namespace n ON n.nspname = t.table_schema
			JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
			WHERE t.table_type = 'BASE TABLE'
				AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
				AND t.table_schema NOT LIKE 'pg_toast%'
			ORDER BY t.table_schema, t.table_name;
		`);
		if (!tables[0]) return [];

		// Counting a table reads all of it, so counting every table on each listing scanned the
		// whole database. Only tables estimated below EXACT_COUNT_LIMIT rows are counted; larger
		// ones report their estimate.
		const counted = tables.flatMap((t, index) =>
			t.estimate < EXACT_COUNT_LIMIT ? [{ ...t, index }] : [],
		);

		// A query per table queues behind the pool's 10 connections, and with enough
		// tables the ones at the back wait past connectionTimeoutMillis and fail the
		// whole list. Count in a few statements instead, fewer than the pool holds.
		const COUNT_STATEMENTS = 4;
		const countSelects: string[][] = Array.from({ length: COUNT_STATEMENTS }, () => []);
		counted.forEach((t, position) => {
			countSelects[position % COUNT_STATEMENTS]?.push(
				`SELECT ${t.index} AS index, COUNT(*) AS count FROM "${escapeChar(t.schemaName)}"."${escapeChar(t.tableName)}"`,
			);
		});
		const countResults = await Promise.all(
			countSelects
				.filter((selects) => selects.length > 0)
				.map((selects) =>
					pool.query<{ index: number; count: string }>(selects.join(" UNION ALL ")),
				),
		);
		const countByIndex = new Map(
			countResults.flatMap(({ rows }) =>
				rows.map((row) => [row.index, Number(row.count)] as const),
			),
		);

		return tables.map((t, index) => {
			const count = countByIndex.get(index);
			return {
				schemaName: t.schemaName,
				tableName: t.tableName,
				rowCount: count ?? Math.round(t.estimate),
				...(count === undefined && { rowCountEstimated: true }),
			};
		});
	}

	async createTable({
		tableData,
		db,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		const { tableName, fields, foreignKeys } = tableData;
		const pool = await getDbPool(db);

		const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);
		const columnDefs = fields.map((field: FieldDataType) => {
			let def = `"${field.columnName}" ${field.columnType}`;
			if (field.isArray) def += "[]";
			if (primaryKey.length === 1 && field.isPrimaryKey) def += " PRIMARY KEY";
			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
			if (!field.isNullable) def += " NOT NULL";
			if (field.isIdentity) def += " GENERATED ALWAYS AS IDENTITY";
			if (field.defaultValue && !field.isIdentity) def += ` DEFAULT ${field.defaultValue}`;
			return def;
		});
		if (primaryKey.length > 1)
			columnDefs.push(`PRIMARY KEY (${primaryKey.map((c) => `"${c}"`).join(", ")})`);

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
		const { tableName, schemaName, db, cascade } = params;
		const pool = await getDbPool(db);
		const table = qualifiedTable(tableName, schemaName);

		await this.assertTableExists(pool, tableName, schemaName);

		const rowCount = await this.getTableRowCount(pool, table);

		if (!cascade) {
			const related = await this.getFkConstraints(pool, tableName, schemaName);
			if (related.length > 0)
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(pool, tableName, schemaName),
				};
		}

		try {
			await pool.query(`DROP TABLE ${table} ${cascade ? "CASCADE" : "RESTRICT"}`);
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			const pgErr = error as { code?: string };
			if (pgErr.code === "2BP01") {
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.getRelatedRecordsForTable(pool, tableName, schemaName),
				};
			}
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, { message: `Failed to delete table "${tableName}"` });
		}
	}

	async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		try {
			const { tableName, newTableName, schemaName: requestedSchema, db } = params;
			this.assertDifferentTableName(tableName, newTableName);
			const pool = await getDbPool(db);

			// Tables are listed from every user schema, so resolve the actual schema
			// instead of assuming "public".
			const { rows: schemaRows } = await pool.query(
				`SELECT table_schema as "schemaName" FROM information_schema.tables WHERE table_name = $1 AND table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema NOT LIKE 'pg_toast%';`,
				[tableName],
			);
			const schemas = (schemaRows as Array<{ schemaName: string }>).map((r) => r.schemaName);
			if (schemas.length === 0)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
			if (requestedSchema && !schemas.includes(requestedSchema)) {
				throw new HTTPException(404, {
					message: `Table "${requestedSchema}"."${tableName}" does not exist`,
				});
			}
			if (!requestedSchema && schemas.length > 1)
				throw new HTTPException(400, {
					message: `Table "${tableName}" exists in multiple schemas (${schemas.join(", ")}); rename is ambiguous`,
				});
			const schemaName = requestedSchema ?? (schemas[0] as string);

			const { rows: targetRows } = await pool.query(
				`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2) as exists;`,
				[newTableName, schemaName],
			);
			if (targetRows[0]?.exists)
				throw new HTTPException(409, {
					message: `Table "${newTableName}" already exists`,
				});

			await pool.query(
				`ALTER TABLE "${schemaName.replaceAll('"', '""')}"."${tableName.replaceAll('"', '""')}" RENAME TO "${newTableName.replaceAll('"', '""')}"`,
			);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getTableSchema({
		tableName,
		schemaName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const pool = await getDbPool(db);
		const schema = schemaOf("$1", "$2");
		const values = [tableName, schemaName ?? null];

		const { rows: tableRows } = await pool.query<{ schemaName: string }>(
			`SELECT table_schema as "schemaName" FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = $1`,
			values,
		);
		const tableSchema = tableRows[0]?.schemaName;
		if (!tableSchema)
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
			 FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = $1 ORDER BY ordinal_position`,
			values,
		);

		const { rows: constraints } = await pool.query<ConstraintInfo>(
			`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
			 FROM information_schema.table_constraints tc
			 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
			 LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema AND tc.constraint_type = 'FOREIGN KEY'
			 WHERE tc.table_schema = ${schema} AND tc.table_name = $1 ORDER BY tc.constraint_type, tc.constraint_name`,
			values,
		);

		const { rows: indexes } = await pool.query<IndexInfo>(
			`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = ${schema} AND tablename = $1
			 AND indexname NOT IN (SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = ${schema} AND table_name = $1 AND constraint_type = 'PRIMARY KEY')`,
			values,
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

		const lines: string[] = [`create table ${tableSchema}.${tableName} (`];
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
		schemaName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
		schemaName?: string;
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = await getDbPool(db);
		const schema = schemaOf("$1", "$2");
		const { rows } = await pool.query(
			`SELECT
				c.column_name as "columnName", c.data_type as "dataType", c.udt_name as "udtName",
				c.is_nullable = 'YES' as "isNullable", c.column_default as "columnDefault",
				CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey",
				CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as "isForeignKey",
				fk.referenced_schema as "referencedSchema", fk.referenced_table as "referencedTable",
				fk.referenced_column as "referencedColumn",
				CASE WHEN c.data_type = 'USER-DEFINED' THEN
					(SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = c.udt_name)
				ELSE NULL END as "enumValues"
			FROM information_schema.columns c
			LEFT JOIN (
				SELECT ku.column_name FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
				WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = ${schema} AND tc.table_name = $1
			) pk ON c.column_name = pk.column_name
			LEFT JOIN (
				SELECT kcu.column_name, ccu.table_schema AS referenced_schema, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
				JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
				WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${schema} AND tc.table_name = $1
			) fk ON c.column_name = fk.column_name
			WHERE c.table_schema = ${schema} AND c.table_name = $1 ORDER BY c.ordinal_position;`,
			[tableName, schemaName ?? null],
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
				...(r.referencedSchema && { referencedSchema: r.referencedSchema }),
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
			schemaName,
			db,
		} = params;
		const pool = await getDbPool(db);

		await this.assertTableExists(pool, tableName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = ${schemaOf("$1", "$3")}) as exists;`,
			[tableName, columnName, schemaName ?? null],
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

		await pool.query(`ALTER TABLE ${table} ADD COLUMN ${def}`);
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const { tableName, schemaName, columnName, cascade, db } = params;
		const pool = await getDbPool(db);

		await this.assertTableExists(pool, tableName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = ${schemaOf("$1", "$3")}) as exists;`,
			[tableName, columnName, schemaName ?? null],
		);
		if (!colRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		const { rowCount } = await pool.query(
			`ALTER TABLE ${table} DROP COLUMN "${columnName}" ${cascade ? "CASCADE" : "RESTRICT"}`,
		);
		return { deletedCount: rowCount ?? 0 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, schemaName, columnName, columnType, isNullable, defaultValue, db } =
			params;
		const pool = await getDbPool(db);

		await this.assertTableExists(pool, tableName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		const { rows: colRows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = ${schemaOf("$1", "$3")}) as exists;`,
			[tableName, columnName, schemaName ?? null],
		);
		if (!colRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		await inTransaction(pool, async (client) => {
			await client.query(
				`ALTER TABLE ${table} ALTER COLUMN "${columnName}" TYPE ${columnType}`,
			);
			await client.query(
				`ALTER TABLE ${table} ALTER COLUMN "${columnName}" ${isNullable ? "DROP" : "SET"} NOT NULL`,
			);
			if (defaultValue?.trim()) {
				await client.query(
					`ALTER TABLE ${table} ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue.trim()}`,
				);
			} else {
				await client.query(`ALTER TABLE ${table} ALTER COLUMN "${columnName}" DROP DEFAULT`);
			}
		});
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, schemaName, columnName, newColumnName, db } = params;
		const pool = await getDbPool(db);

		const colExistsQuery = `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 AND table_schema = ${schemaOf("$1", "$3")}) as exists;`;

		await this.assertTableExists(pool, tableName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		const { rows: curRows } = await pool.query(colExistsQuery, [
			tableName,
			columnName,
			schemaName ?? null,
		]);
		if (!curRows[0]?.exists)
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		const { rows: nextRows } = await pool.query(colExistsQuery, [
			tableName,
			newColumnName,
			schemaName ?? null,
		]);
		if (nextRows[0]?.exists)
			throw new HTTPException(409, {
				message: `Column "${newColumnName}" already exists in table "${tableName}"`,
			});

		await pool.query(
			`ALTER TABLE ${table} RENAME COLUMN "${columnName}" TO "${newColumnName}"`,
		);
	}

	// --- Server logs ---

	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const pool = await getDbPool(db);
		try {
			const {
				rows: [settings],
			} = await pool.query<{ collector: string; destination: string; offset: string }>(
				`${SERVER_LOGS_MARKER} SELECT current_setting('logging_collector') AS collector,
					current_setting('log_destination') AS destination,
					EXTRACT(EPOCH FROM (now() AT TIME ZONE current_setting('log_timezone'))
						- (now() AT TIME ZONE 'UTC')) / 60 AS offset`,
			);
			if (settings.collector !== "on") {
				return logsUnavailable(
					"logging_collector is off, so PostgreSQL writes its log to stderr, outside the database. Turn it on to read the log here.",
				);
			}

			// jsonlog and csvlog carry the SQLSTATE and backend type that stderr leaves out.
			const destinations = settings.destination.split(",").map((d) => d.trim());
			const format: PgLogFormat =
				(["jsonlog", "csvlog"] as const).find((f) => destinations.includes(f)) ?? "stderr";

			const {
				rows: [file],
			} = await pool.query<{ path: string | null; size: string | null }>(
				`${SERVER_LOGS_MARKER} SELECT path, (pg_stat_file(path)).size AS size
					FROM pg_current_logfile($1) AS path`,
				[format],
			);
			if (!file.path || file.size === null) {
				return logsUnavailable("PostgreSQL has not opened a log file yet.");
			}

			const size = Number(file.size);
			const offset = Math.max(0, size - LOG_TAIL_BYTES);
			const {
				rows: [chunk],
			} = await pool.query<{ data: Buffer }>(
				`${SERVER_LOGS_MARKER} SELECT pg_read_binary_file($1, $2, $3) AS data`,
				[file.path, offset, size - offset],
			);

			return {
				available: true,
				source: `${file.path} (${format})`,
				entries: newestEntries(
					parsePgLog(chunk.data.toString("utf8"), format, {
						logUtcOffsetMinutes: Number(settings.offset),
						truncatedStart: offset > 0,
					}),
				),
			};
		} catch (e) {
			if (isPgDatabaseError(e) && e.code === "42501") {
				return logsUnavailable(
					"Reading the server log needs superuser, or: GRANT pg_monitor, pg_read_server_files TO <user>;",
				);
			}
			throw this.wrapError(e);
		}
	}

	// --- Indexes ---

	async getTableIndexes({
		tableName,
		schemaName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		try {
			const indexes = await this.listIndexes(await getDbPool(db), tableName, schemaName);
			return indexes.map(({ schemaName: _schemaName, ...index }) => index);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		const {
			tableName,
			schemaName,
			indexName,
			columns,
			isUnique,
			method = "btree",
			db,
		} = params;
		try {
			const pool = await getDbPool(db);
			await this.assertTableExists(pool, tableName, schemaName);

			const { rows: columnRows } = await pool.query<{ columnName: string }>(
				`SELECT column_name as "columnName" FROM information_schema.columns WHERE table_name = $1 AND table_schema = ${schemaOf("$1", "$2")}`,
				[tableName, schemaName ?? null],
			);
			const existing = new Set(columnRows.map((row) => row.columnName));
			const missing = columns.find((column) => !existing.has(column));
			if (missing !== undefined)
				throw new HTTPException(400, {
					message: `Column "${missing}" does not exist in table "${tableName}"`,
				});

			if (!DATABASE_ENGINES.pg.indexes.methods.includes(method))
				throw new HTTPException(400, { message: `Unsupported index method "${method}"` });

			await pool.query(
				`CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${this.quoteIdentifier(indexName)} ON ${qualifiedTable(tableName, schemaName)} USING ${method} (${columns.map((column) => this.quoteIdentifier(column)).join(", ")})`,
			);
		} catch (e) {
			// 42P07: the name is taken; 23505: existing rows break the new unique index.
			// 0A000 and 42704: the method cannot index these columns (hash on two columns,
			// gin on a type with no operator class).
			const code = (e as { code?: string }).code;
			if (e instanceof Error && (code === "42P07" || code === "23505"))
				throw new HTTPException(409, { message: e.message, cause: e });
			if (e instanceof Error && (code === "0A000" || code === "42704"))
				throw new HTTPException(400, { message: e.message, cause: e });
			throw this.wrapError(e);
		}
	}

	async dropIndex({
		tableName,
		schemaName,
		indexName,
		db,
	}: DropIndexParamsSchemaType): Promise<void> {
		try {
			const pool = await getDbPool(db);
			const index = (await this.listIndexes(pool, tableName, schemaName)).find(
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

			// Qualified, because a bare name would resolve through search_path and could
			// hit a same-named index that belongs to another schema's table.
			await pool.query(
				`DROP INDEX ${this.quoteIdentifier(index.schemaName)}.${this.quoteIdentifier(indexName)}`,
			);
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// --- Records ---

	async addRecord({
		db,
		schemaName,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		schemaName?: string;
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const pool = await getDbPool(db);
		const columns = Object.keys(data);
		const values = Object.values(data);
		const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
		const colNames = columns.map((c) => `"${c}"`).join(", ");
		const result = await pool.query(
			`INSERT INTO ${qualifiedTable(tableName, schemaName)} (${colNames}) VALUES (${placeholders}) RETURNING *`,
			values,
		);
		if (result.rowCount === 0)
			throw new HTTPException(500, { message: `Failed to insert record into "${tableName}"` });
		return { insertedCount: result.rowCount ?? 0 };
	}

	async updateRecords({
		params,
		schemaName,
		db,
	}: {
		db: DatabaseSchemaType["db"];
		schemaName?: string;
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		const pool = await getDbPool(db);
		const table = qualifiedTable(tableName, schemaName);

		const keyColumns = this.resolveKeyColumns(params);
		this.assertWholeKey(await this.getPrimaryKeyColumns(pool, table), keyColumns);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		try {
			return await inTransaction(pool, async (client) => {
				let total = 0;
				for (const { keyValues, rowUpdates } of groups) {
					const values: unknown[] = [];
					const setClauses = rowUpdates.map((u) => {
						if (u.useDefault) return `"${u.columnName}" = DEFAULT`;
						values.push(
							u.value !== null && typeof u.value === "object"
								? JSON.stringify(u.value)
								: u.value,
						);
						return `"${u.columnName}" = $${values.length}`;
					});
					const whereClauses = keyColumns.map(
						(column, i) => `"${column}" = $${values.length + i + 1}`,
					);
					values.push(...keyValues);
					const result = await client.query(
						`UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
						values,
					);
					if (result.rowCount === 0)
						throw new HTTPException(404, {
							message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
						});
					total += result.rowCount ?? 0;
				}
				return { updatedCount: total };
			});
		} catch (error) {
			if (
				error instanceof HTTPException ||
				isPgConstraintViolation(error) ||
				isPgDataException(error)
			)
				throw error;
			throw new HTTPException(500, { message: `Failed to update records in "${tableName}"` });
		}
	}

	async deleteRecords({
		tableName,
		schemaName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pool = await getDbPool(db);
		const table = qualifiedTable(tableName, schemaName);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		this.assertDeletableKey(await this.getPrimaryKeyColumns(pool, table));

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");

		try {
			const result = await pool.query(
				`DELETE FROM ${table} WHERE "${pkColumn}" IN (${placeholders}) RETURNING *`,
				pkValues,
			);
			return { deletedCount: result.rowCount ?? 0, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			const pgErr = error as { code?: string };
			if (pgErr.code === "23503") {
				const relatedRecords = await this.getRelatedRecords(
					pool,
					tableName,
					schemaName,
					primaryKeys,
				);
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
		schemaName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pool = await getDbPool(db);
		const table = qualifiedTable(tableName, schemaName);
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		this.assertDeletableKey(await this.getPrimaryKeyColumns(pool, table));

		const pkValues = primaryKeys.map((pk) => pk.value);

		try {
			return await inTransaction(pool, async (client) => {
				const fkConstraints = await this.getFkConstraints(client, tableName, schemaName);
				let totalRelated = 0;

				const deleteRelated = async (
					targetTable: string,
					targetSchema: string,
					targetColumn: string,
					values: unknown[],
				) => {
					const target = qualifiedTable(targetTable, targetSchema);
					const nested = await this.getFkConstraints(client, targetTable, targetSchema);
					for (const nfk of nested) {
						const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
						const { rows } = await client.query(
							`SELECT "${nfk.referencedColumn}" FROM ${target} WHERE "${targetColumn}" IN (${placeholders})`,
							values,
						);
						const nestedVals = rows.map(
							(r: Record<string, unknown>) => r[nfk.referencedColumn],
						);
						if (nestedVals.length > 0)
							await deleteRelated(
								nfk.referencingTable,
								nfk.referencingSchema,
								nfk.referencingColumn,
								nestedVals,
							);
					}
					const ph = values.map((_, i) => `$${i + 1}`).join(", ");
					const res = await client.query(
						`DELETE FROM ${target} WHERE "${targetColumn}" IN (${ph})`,
						values,
					);
					totalRelated += res.rowCount ?? 0;
				};

				// Every relationship, even a second one from the same child table: a message's
				// recipient_id must go as well as its sender_id.
				for (const c of fkConstraints) {
					await deleteRelated(
						c.referencingTable,
						c.referencingSchema,
						c.referencingColumn,
						pkValues,
					);
				}

				const ph = pkValues.map((_, i) => `$${i + 1}`).join(", ");
				const result = await client.query(
					`DELETE FROM ${table} WHERE "${pkColumn}" IN (${ph}) RETURNING *`,
					pkValues,
				);
				return { deletedCount: (result.rowCount ?? 0) + totalRelated };
			});
		} catch (error) {
			if (error instanceof HTTPException) throw error;
			throw new HTTPException(500, {
				message: `Failed to force delete records from "${tableName}"`,
			});
		}
	}

	async bulkInsertRecords({
		tableName,
		schemaName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		if (!records || records.length === 0)
			throw new HTTPException(400, { message: "At least one record is required" });

		const pool = await getDbPool(db);

		try {
			return await inTransaction(pool, async (client) => {
				const columns = Object.keys(records[0]);
				const colNames = columns.map((c) => `"${c}"`).join(", ");
				let successCount = 0;

				for (const record of records) {
					const values = columns.map((col) => record[col]);
					const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
					try {
						await client.query(
							`INSERT INTO ${qualifiedTable(tableName, schemaName)} (${colNames}) VALUES (${placeholders}) RETURNING *`,
							values,
						);
						successCount++;
					} catch (error) {
						if (isPgConstraintViolation(error) || isPgDataException(error)) throw error;
						throw new HTTPException(500, {
							message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
						});
					}
				}
				return {
					success: true,
					message: `Bulk insert completed: ${successCount} records inserted`,
					successCount,
					failureCount: 0,
				};
			});
		} catch (error) {
			if (
				error instanceof HTTPException ||
				isPgConstraintViolation(error) ||
				isPgDataException(error)
			)
				throw error;
			throw new HTTPException(500, {
				message: `Failed to bulk insert records into "${tableName}"`,
			});
		}
	}

	override async exportTableData({
		tableName,
		schemaName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		try {
			const pool = await getDbPool(db);
			const { rows } = await pool.query<Record<string, unknown>>(
				`SELECT * FROM ${qualifiedTable(tableName, schemaName)}`,
			);
			if (rows.length === 0)
				throw new HTTPException(404, {
					message: `Table "${tableName}" does not exist or has no data`,
				});
			return { cols: Object.keys(rows[0]), rows };
		} catch (e) {
			throw this.wrapError(e);
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
		const pool = await getDbPool(db);
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

	/** CockroachDB speaks the PostgreSQL protocol but has no pg_database_size(). */
	private supportsDatabaseSize(pool: PgPool): Promise<boolean> {
		let supported = this.databaseSizeSupport.get(pool);
		if (!supported) {
			supported = pool
				.query(`SELECT to_regprocedure('pg_database_size(name)') IS NOT NULL AS "supported"`)
				.then(({ rows }) => rows[0]?.supported === true)
				.catch((e) => {
					this.databaseSizeSupport.delete(pool);
					throw e;
				});
			this.databaseSizeSupport.set(pool, supported);
		}
		return supported;
	}

	private async assertTableExists(
		pool: PgPool,
		tableName: string,
		schemaName: string | undefined,
	): Promise<void> {
		const { rows } = await pool.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = ${schemaOf("$1", "$2")}) as exists;`,
			[tableName, schemaName ?? null],
		);
		if (!rows[0]?.exists)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
	}

	private async listIndexes(
		pool: PgPool,
		tableName: string,
		schemaName: string | undefined,
	): Promise<Array<IndexInfoSchemaType & { schemaName: string }>> {
		await this.assertTableExists(pool, tableName, schemaName);
		const { rows } = await pool.query(
			`SELECT
				ic.relname AS "indexName",
				n.nspname AS "schemaName",
				ARRAY(
					SELECT COALESCE(a.attname::text, pg_get_indexdef(i.indexrelid, k, true))
					FROM generate_series(1, i.indnkeyatts) AS k
					LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[k - 1] AND a.attnum > 0
					ORDER BY k
				) AS "columns",
				i.indisunique AS "isUnique",
				am.amname AS "method",
				CASE
					WHEN i.indisprimary THEN 'primary'
					WHEN EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.contype IN ('u', 'x')) THEN 'unique-constraint'
					ELSE 'index'
				END AS "kind",
				CASE WHEN i.indpred IS NOT NULL OR i.indexprs IS NOT NULL THEN pg_get_indexdef(i.indexrelid) END AS "definition"
			 FROM pg_index i
			 JOIN pg_class ic ON ic.oid = i.indexrelid
			 JOIN pg_namespace n ON n.oid = ic.relnamespace
			 JOIN pg_am am ON am.oid = ic.relam
			 WHERE i.indrelid = $1::regclass
			 ORDER BY i.indisprimary DESC, ic.relname`,
			[qualifiedTable(tableName, schemaName)],
		);
		return rows;
	}

	/** `table` is a quoted, optionally schema-qualified name from `qualifiedTable`. */
	private async getPrimaryKeyColumns(pool: PgPool, table: string): Promise<string[]> {
		const result = await pool.query(
			`SELECT a.attname as column_name
			 FROM pg_index i
			 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
			 WHERE i.indrelid = $1::regclass AND i.indisprimary
			 ORDER BY array_position(i.indkey, a.attnum)`,
			[table],
		);
		return result.rows.map((row) => row.column_name);
	}

	/** The FKs that reference `tableName`, each with the schema of its referencing table. */
	private async getFkConstraints(
		pool: PgQueryable,
		tableName: string,
		schemaName: string | undefined,
	): Promise<Array<ForeignKeyConstraint & { referencingSchema: string }>> {
		const { rows } = await pool.query(
			`SELECT tc.constraint_name, tc.table_schema as referencing_schema, tc.table_name as referencing_table, kcu.column_name as referencing_column,
				ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
			 FROM information_schema.table_constraints AS tc
			 JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
			 JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
			 WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1 AND ccu.table_schema = ${schemaOf("$1", "$2")}`,
			[tableName, schemaName ?? null],
		);
		return rows.map((row: ForeignKeyConstraintRow & { referencing_schema: string }) => ({
			constraintName: row.constraint_name,
			referencingSchema: row.referencing_schema,
			referencingTable: row.referencing_table,
			referencingColumn: row.referencing_column,
			referencedTable: row.referenced_table,
			referencedColumn: row.referenced_column,
		}));
	}

	private async getRelatedRecordsForTable(
		pool: PgPool,
		tableName: string,
		schemaName: string | undefined,
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkConstraints(pool, tableName, schemaName);
		if (fks.length === 0) return [];
		const results: RelatedRecord[] = [];
		for (const fk of fks) {
			const { rows } = await pool.query(
				`SELECT * FROM ${qualifiedTable(fk.referencingTable, fk.referencingSchema)} LIMIT 100`,
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
		return results;
	}

	private async getRelatedRecords(
		pool: PgPool,
		tableName: string,
		schemaName: string | undefined,
		primaryKeys: DeleteRecordSchemaType["primaryKeys"],
	): Promise<RelatedRecord[]> {
		const fks = await this.getFkConstraints(pool, tableName, schemaName);
		if (fks.length === 0) return [];

		const results: RelatedRecord[] = [];
		const pkValues = primaryKeys.map((pk) => pk.value);
		const constraintsByTable = new Map<string, typeof fks>();
		for (const fk of fks) {
			const key = `${fk.referencingSchema}.${fk.referencingTable}.${fk.referencingColumn}`;
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
				`SELECT * FROM ${qualifiedTable(fk.referencingTable, fk.referencingSchema)} WHERE "${fk.referencingColumn}" IN (${ph}) LIMIT 100`,
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
		return results;
	}

	private async getTableRowCount(pool: PgPool, table: string): Promise<number> {
		const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
		return Number.parseInt(rows[0]?.count ?? "0", 10);
	}
}
