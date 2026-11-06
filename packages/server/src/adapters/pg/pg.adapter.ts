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
	DeleteTableParams,
	DeleteTableResult,
	FieldDataType,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogsResult,
} from "@db-studio/shared/types";
import { mapPostgresToDataType, standardizeDataTypeLabel } from "@db-studio/shared/types";
import type { DatabaseError, Pool as PgPool, PoolClient } from "pg";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	type DriverErrorClass,
	EXACT_COUNT_LIMIT,
	probeOnce,
	READ_ONLY_MESSAGE,
} from "@/adapters/base.adapter.js";
import { decodeCursor } from "@/adapters/cursor.js";
import { logsUnavailable, newestEntries, SERVER_LOGS_MARKER } from "@/adapters/server-logs.js";
import { buildFilterConditions, createBinds, whereSql } from "@/adapters/sql-filters.js";
import {
	sqlCursorSchema,
	keysetOrderBy,
	keysetPage,
	keysetPredicate,
	orderTerms,
} from "@/adapters/sql-pagination.js";
import {
	type ReferencingKey,
	SqlAdapter,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { loadedDriver } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import { type PgLogFormat, parsePgLog } from "./pg.log-parser.js";
import {
	pgFilters,
	pgKeyset,
	pgPlaceholder,
	qualifiedTable,
	quotePgIdent,
	schemaOf,
} from "./pg.query-builder.js";

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

/** A PostgreSQL server error; it carries the SQLSTATE `code`. */
const isPgError = (error: unknown): error is DatabaseError =>
	error instanceof loadedDriver("pg").DatabaseError;

/** SQLSTATE classes that answer with another status than 500. */
const STATUS_BY_SQLSTATE_CLASS: Record<string, number> = {
	"08": 503, // connection exception
	"22": 400, // data exception: invalid date, text in a number column, value too long
	"23": 409, // integrity constraint violation: foreign key, unique, not null, check
};

/** Bytes read from the end of the log file; enough for several hundred entries. */
const LOG_TAIL_BYTES = 1024 * 1024;

export class PgAdapter extends SqlAdapter<PgQueryable> {
	/** CockroachDB speaks the PostgreSQL protocol but has no pg_database_size(). */
	private supportsDatabaseSize = probeOnce(async (pool: PgPool) => {
		const { rows } = await pool.query(
			`SELECT to_regprocedure('pg_database_size(name)') IS NOT NULL AS "supported"`,
		);

		return rows[0]?.supported === true;
	});

	protected readonly quoteIdentifier = quotePgIdent;
	protected readonly engine = "pg";
	protected readonly placeholder = pgPlaceholder;

	protected async connect<T>(db: string, work: (conn: PgQueryable) => Promise<T>) {
		return work(await connector("pg").pool(db));
	}

	protected async rows<T>(conn: PgQueryable, sql: string, values: unknown[] = []) {
		return (await conn.query(sql, values)).rows as T[];
	}

	protected async execute(conn: PgQueryable, sql: string, values: unknown[] = []) {
		return (await conn.query(sql, values)).rowCount ?? 0;
	}

	protected async transaction<T>(db: string, work: (conn: PgQueryable) => Promise<T>) {
		return inTransaction(await connector("pg").pool(db), work);
	}

	protected isFkViolation(e: unknown) {
		return isPgError(e) && e.code === "23503";
	}

	/** JSON and array values are sent as JSON text. */
	protected override async updateTarget(
		conn: PgQueryable,
		_db: string,
		tableName: string,
		schemaName: string | undefined,
	) {
		return {
			primaryKey: await this.primaryKey(conn, tableName, schemaName),
			bindValue: (_column: string, value: unknown, bind: (value: unknown) => string) =>
				bind(value !== null && typeof value === "object" ? JSON.stringify(value) : value),
		};
	}

	protected override tableRef(tableName: string, schemaName?: string) {
		return qualifiedTable(tableName, schemaName);
	}

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		// pg-pool's connect timeout and a dropped socket are plain errors.
		if (!isPgError(e))
			return e.message.includes("timeout expired") ||
				e.message.includes("Connection terminated")
				? { status: 503 }
				: undefined;

		if (e.code === "25006") return { status: 403, message: READ_ONLY_MESSAGE };

		// The connected role lacks a privilege, or a row-level security policy refused the row.
		if (e.code === "42501") return { status: 403 };

		// undefined_table: dropped, renamed, or a stale URL after switching databases.
		if (e.code === "42P01") return { status: 404 };

		const status = STATUS_BY_SQLSTATE_CLASS[e.code?.slice(0, 2) ?? ""];

		return status ? { status } : undefined;
	}

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

		const pool = await connector("pg").pool(db);
		const table = qualifiedTable(tableName, schemaName);
		const { values, bind } = createBinds(pgPlaceholder);
		const filterConditions = buildFilterConditions(filters, bind, pgFilters);
		const filterValues = [...values];

		// Primary key columns keep cursor pagination stable. The total does not depend on them or
		// on the page, so it is counted at the same time instead of after.
		const [pkColumns, { total, estimated }] = await Promise.all([
			this.primaryKey(pool, tableName, schemaName),
			this.countRows(pool, table, whereSql(filterConditions), filterValues),
		]);

		const terms = orderTerms(sort, order, pkColumns.length ? pkColumns : ["ctid"]);
		const backward = direction === "desc";
		const cursorValues = cursor ? decodeCursor(cursor, sqlCursorSchema)?.values : undefined;

		const where = whereSql(
			cursorValues
				? [...filterConditions, keysetPredicate(terms, cursorValues, backward, bind, pgKeyset)]
				: filterConditions,
		);

		// SELECT * omits ctid and CockroachDB's hidden rowid primary key. Primary key columns are
		// selected explicitly; ctid is a reserved system column name, so selecting it by name
		// cannot shadow a user column.
		const usesCtid = terms.some((term) => term.column === "ctid");
		const extraSelect = [...pkColumns.map(quotePgIdent), ...(usesCtid ? ["ctid"] : [])];

		const dataRes = await pool.query(
			`SELECT ${["*", ...extraSelect].join(", ")} FROM ${table} ${where} ${keysetOrderBy(terms, backward, pgKeyset)} LIMIT ${bind(limit + 1)}`,
			values,
		);

		const { rows, ...page } = keysetPage(dataRes.rows, { limit, cursor, backward, terms });

		return {
			data: rows
				.map((row) => {
					if (!usesCtid) return row;
					const { ctid: _ctid, ...rest } = row;

					return rest;
				})
				.filter((row) => Object.keys(row).length > 0),
			meta: { limit, total, ...(estimated && { totalEstimated: true }), ...page },
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

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const pool = await connector("pg").pool();

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
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		const pool = await connector("pg").pool();
		const { rows } = await pool.query<DatabaseSchemaType>("SELECT current_database() AS db;");

		if (!rows[0])
			throw new HTTPException(500, { message: "No current database returned from database" });

		return rows[0];
	}

	async getDatabaseConnectionInfo(server: ServerAddress): Promise<ConnectionInfoSchemaType> {
		const pool = await connector("pg").pool();

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

		return {
			host: result.host || server.host,
			port: result.port || server.port,
			user: result.user,
			database: result.database,
			version: result.version.toString(),
			active_connections: result.active_connections,
			max_connections: result.max_connections,
		};
	}

	/**
	 * reltuples is the planner's row estimate, which autovacuum keeps current; it is -1 (0
	 * before PostgreSQL 14) for a table never analyzed.
	 */
	protected tableEstimates(conn: PgQueryable) {
		return this.rows<TableEstimate>(
			conn,
			`SELECT t.table_schema as "schemaName", t.table_name as "tableName", c.reltuples as "estimate"
			FROM information_schema.tables t
			JOIN pg_catalog.pg_namespace n ON n.nspname = t.table_schema
			JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
			WHERE t.table_type = 'BASE TABLE'
				AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
				AND t.table_schema NOT LIKE 'pg_toast%'
			ORDER BY t.table_schema, t.table_name`,
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
		const pool = await connector("pg").pool(db);

		const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);

		const columnDefs = fields.map((field: FieldDataType) => {
			let def = `${quotePgIdent(field.columnName)} ${field.columnType}`;

			if (field.isArray) def += "[]";

			if (primaryKey.length === 1 && field.isPrimaryKey) def += " PRIMARY KEY";

			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";

			if (!field.isNullable) def += " NOT NULL";

			if (field.isIdentity) def += " GENERATED ALWAYS AS IDENTITY";

			if (field.defaultValue && !field.isIdentity) def += ` DEFAULT ${field.defaultValue}`;

			return def;
		});

		if (primaryKey.length > 1)
			columnDefs.push(`PRIMARY KEY (${primaryKey.map(quotePgIdent).join(", ")})`);

		const fkDefs =
			foreignKeys?.map((fk: ForeignKeyDataType) => {
				const name = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;

				return `CONSTRAINT ${quotePgIdent(name)} FOREIGN KEY (${quotePgIdent(fk.columnName)}) REFERENCES ${quotePgIdent(fk.referencedTable)} (${quotePgIdent(fk.referencedColumn)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) ?? [];

		await pool.query(
			`CREATE TABLE ${quotePgIdent(tableName)} (\n\t\t\t\t${[...columnDefs, ...fkDefs].join(",\n\t\t\t\t")}\n\t\t\t);`,
		);
	}

	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, schemaName, db, cascade } = params;
		const pool = await connector("pg").pool(db);
		const table = qualifiedTable(tableName, schemaName);

		await this.requireTable(pool, tableName, schemaName);

		const rowCount = await this.rowCount(pool, tableName, schemaName);

		// A table's references to itself go with it.
		const referencing = (await this.referencingKeys(pool, tableName, schemaName)).filter(
			(fk) => fk.table !== tableName || (schemaName !== undefined && fk.schema !== schemaName),
		);

		if (!cascade && referencing.length > 0)
			return {
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: await this.rowsReferencingTable(pool, referencing),
			};

		try {
			await pool.query(`DROP TABLE ${table} ${cascade ? "CASCADE" : "RESTRICT"}`);

			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (error) {
			// A view or another object depends on the table.
			if (isPgError(error) && error.code === "2BP01") {
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
		const { tableName, newTableName, schemaName: requestedSchema, db } = params;
		this.assertDifferentTableName(tableName, newTableName);
		const pool = await connector("pg").pool(db);

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
			`ALTER TABLE ${quotePgIdent(schemaName)}.${quotePgIdent(tableName)} RENAME TO ${quotePgIdent(newTableName)}`,
		);
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
		const pool = await connector("pg").pool(db);
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

	async getTableColumns({
		tableName,
		db,
		schemaName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
		schemaName?: string;
	}): Promise<ColumnInfoSchemaType[]> {
		const pool = await connector("pg").pool(db);
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

		const pool = await connector("pg").pool(db);

		this.assertColumnAbsent(
			await this.requireTable(pool, tableName, schemaName),
			tableName,
			columnName,
		);
		const table = qualifiedTable(tableName, schemaName);

		let def = `${quotePgIdent(columnName)} ${columnType}`;

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
		const pool = await connector("pg").pool(db);

		await this.requireColumn(pool, tableName, columnName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		const { rowCount } = await pool.query(
			`ALTER TABLE ${table} DROP COLUMN ${quotePgIdent(columnName)} ${cascade ? "CASCADE" : "RESTRICT"}`,
		);

		return { deletedCount: rowCount ?? 0 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, schemaName, columnName, columnType, isNullable, defaultValue, db } =
			params;

		const pool = await connector("pg").pool(db);

		await this.requireColumn(pool, tableName, columnName, schemaName);
		const table = qualifiedTable(tableName, schemaName);

		await inTransaction(pool, async (client) => {
			await client.query(
				`ALTER TABLE ${table} ALTER COLUMN ${quotePgIdent(columnName)} TYPE ${columnType}`,
			);
			await client.query(
				`ALTER TABLE ${table} ALTER COLUMN ${quotePgIdent(columnName)} ${isNullable ? "DROP" : "SET"} NOT NULL`,
			);

			if (defaultValue?.trim()) {
				await client.query(
					`ALTER TABLE ${table} ALTER COLUMN ${quotePgIdent(columnName)} SET DEFAULT ${defaultValue.trim()}`,
				);
			} else {
				await client.query(
					`ALTER TABLE ${table} ALTER COLUMN ${quotePgIdent(columnName)} DROP DEFAULT`,
				);
			}
		});
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, schemaName, columnName, newColumnName, db } = params;
		const pool = await connector("pg").pool(db);

		this.assertColumnAbsent(
			await this.requireColumn(pool, tableName, columnName, schemaName),
			tableName,
			newColumnName,
		);
		const table = qualifiedTable(tableName, schemaName);

		await pool.query(
			`ALTER TABLE ${table} RENAME COLUMN ${quotePgIdent(columnName)} TO ${quotePgIdent(newColumnName)}`,
		);
	}

	async getServerLogs({ db }: { db: DatabaseSchemaType["db"] }): Promise<ServerLogsResult> {
		const pool = await connector("pg").pool(db);

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
			if (isPgError(e) && e.code === "42501") {
				return logsUnavailable(
					"Reading the server log needs superuser, or: GRANT pg_monitor, pg_read_server_files TO <user>;",
				);
			}

			throw e;
		}
	}

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
		const pool = await connector("pg").pool(db);
		const columns = Object.keys(data);
		const values = Object.values(data);
		const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
		const colNames = columns.map(quotePgIdent).join(", ");

		const result = await pool.query(
			`INSERT INTO ${qualifiedTable(tableName, schemaName)} (${colNames}) VALUES (${placeholders}) RETURNING *`,
			values,
		);

		if (result.rowCount === 0)
			throw new HTTPException(500, { message: `Failed to insert record into "${tableName}"` });

		return { insertedCount: result.rowCount ?? 0 };
	}

	async bulkInsertRecords({
		tableName,
		schemaName,
		records,
		db,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		return await this.transaction(db, async (client) => {
			const columns = Object.keys(records[0]);
			const colNames = columns.map(quotePgIdent).join(", ");
			let successCount = 0;

			for (const record of records) {
				const values = columns.map((col) => record[col]);
				const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

				await client.query(
					`INSERT INTO ${qualifiedTable(tableName, schemaName)} (${colNames}) VALUES (${placeholders}) RETURNING *`,
					values,
				);
				successCount++;
			}

			return {
				success: true,
				message: `Bulk insert completed: ${successCount} records inserted`,
				successCount,
				failureCount: 0,
			};
		});
	}

	protected async runStatement(conn: PgQueryable, statement: string) {
		const result = await conn.query(statement);

		// A statement that returns rows reports its columns even when no row matches.
		return result.fields.length
			? { columns: result.fields.map((f) => f.name), rows: result.rows }
			: { affected: result.rowCount ?? undefined };
	}

	/** A table with no columns still has a row here, with a NULL column. */
	protected async columnNames(conn: PgQueryable, tableName: string, schemaName?: string) {
		const rows = await this.rows<{ name: string | null }>(
			conn,
			`SELECT c.column_name AS name FROM information_schema.tables t
			 LEFT JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name
			 WHERE t.table_name = $1 AND t.table_schema = ${schemaOf("$1", "$2")}
			 ORDER BY c.ordinal_position`,
			[tableName, schemaName ?? null],
		);

		return rows.length
			? rows.flatMap((row) => (row.name === null ? [] : [row.name]))
			: undefined;
	}

	protected override createIndexSql({
		tableName,
		schemaName,
		indexName,
		columns,
		isUnique,
		method = "btree",
	}: CreateIndexParamsSchemaType) {
		return `CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${quotePgIdent(indexName)} ON ${qualifiedTable(tableName, schemaName)} USING ${method} (${columns.map(quotePgIdent).join(", ")})`;
	}

	/**
	 * Qualified, because a bare name would resolve through search_path and could hit a
	 * same-named index that belongs to another schema's table.
	 */
	protected override dropIndexSql(index: IndexInfoSchemaType & { schemaName?: string }) {
		return `DROP INDEX ${quotePgIdent(index.schemaName ?? "")}.${quotePgIdent(index.indexName)}`;
	}

	protected override indexError(e: Error) {
		const code = (e as { code?: string }).code;

		// 42P07: the name is taken; 23505: existing rows break the new unique index.
		if (code === "42P07" || code === "23505") return { status: 409 };

		// 0A000 and 42704: the method cannot index these columns (hash on two columns, gin on a
		// type with no operator class).
		if (code === "0A000" || code === "42704") return { status: 400 };

		return undefined;
	}

	protected async listIndexes(
		pool: PgQueryable,
		tableName: string,
		schemaName: string | undefined,
	): Promise<Array<IndexInfoSchemaType & { schemaName: string }>> {
		await this.requireTable(pool, tableName, schemaName);

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

	protected async primaryKey(conn: PgQueryable, tableName: string, schemaName?: string) {
		const rows = await this.rows<{ column_name: string }>(
			conn,
			`SELECT a.attname as column_name
			 FROM pg_index i
			 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
			 WHERE i.indrelid = $1::regclass AND i.indisprimary
			 ORDER BY array_position(i.indkey, a.attnum)`,
			[qualifiedTable(tableName, schemaName)],
		);

		return rows.map((row) => row.column_name);
	}

	protected async referencingKeys(
		conn: PgQueryable,
		tableName: string,
		schemaName?: string,
	): Promise<ReferencingKey[]> {
		const columnsOf = (relation: string, keys: string) =>
			`ARRAY(SELECT a.attname::text FROM unnest(c.${keys}) WITH ORDINALITY AS k(attnum, position)
				JOIN pg_attribute a ON a.attrelid = c.${relation} AND a.attnum = k.attnum ORDER BY k.position)`;

		return this.rows<ReferencingKey>(
			conn,
			`SELECT c.conname AS "constraintName", n.nspname AS "schema", t.relname AS "table",
				${columnsOf("conrelid", "conkey")} AS "columns",
				${columnsOf("confrelid", "confkey")} AS "referencedColumns"
			 FROM pg_constraint c
			 JOIN pg_class t ON t.oid = c.conrelid
			 JOIN pg_namespace n ON n.oid = t.relnamespace
			 WHERE c.contype = 'f' AND c.confrelid = $1::regclass
			 ORDER BY n.nspname, t.relname, c.conname`,
			[qualifiedTable(tableName, schemaName)],
		);
	}
}
