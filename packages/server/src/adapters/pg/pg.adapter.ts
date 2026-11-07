import type {
	AlterColumnParamsSchemaType,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateIndexParamsSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteTableParams,
	FieldDataType,
	IndexInfoSchemaType,
	RenameTableParamsSchemaType,
	ServerLogsResult,
} from "@db-studio/shared/types";
import { connectionInfoSchema } from "@db-studio/shared/types";
import type { DatabaseError, Pool as PgPool, PoolClient } from "pg";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import {
	type DriverErrorClass,
	EXACT_COUNT_LIMIT,
	probeOnce,
	READ_ONLY_MESSAGE,
} from "@/adapters/base.adapter.js";
import { logsUnavailable, newestEntries, SERVER_LOGS_MARKER } from "@/adapters/server-logs.js";
import {
	fullForeignKeyName,
	type ReferencingKey,
	SqlAdapter,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import type { ServerAddress } from "@/connection-url.js";
import { loadedDriver } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import { errorFields } from "@/operational-log.js";
import { type PgLogFormat, parsePgLog } from "./pg.log-parser.js";
import {
	pgFilters,
	pgKeyset,
	pgPlaceholder,
	qualifiedTable,
	quotePgIdent,
	schemaOf,
	mapPostgresToDataType,
	standardizeDataTypeLabel,
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
	"2B": 409, // dependent objects still exist: a view or constraint uses what a DROP removes
};

/** The codes `errorFields` gives node-postgres's codeless connection failures. */
const UNREACHABLE = new Set([
	"CONNECT_TIMEOUT",
	"CONNECTION_TERMINATED",
	"CONNECTION_BROKEN",
	"POOL_ACQUIRE_TIMEOUT",
]);

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

	/**
	 * An array goes to an array column as is, which node-postgres sends as an array literal;
	 * any other object or array is sent as JSON text, as a JSON column takes it.
	 */
	protected override async writeTarget(
		conn: PgQueryable,
		_db: string,
		tableName: string,
		schemaName: string | undefined,
	) {
		const [primaryKey, arrayColumns] = await Promise.all([
			this.primaryKey(conn, tableName, schemaName),
			this.rows<{ name: string }>(
				conn,
				`SELECT column_name AS name FROM information_schema.columns
				 WHERE table_name = $1 AND table_schema = ${schemaOf("$1", "$2")} AND data_type = 'ARRAY'`,
				[tableName, schemaName ?? null],
			),
		]);

		const arrays = new Set(arrayColumns.map((c) => c.name));

		return {
			primaryKey,
			bindValue: (column: string, value: unknown, bind: (value: unknown) => string) =>
				bind(
					value !== null &&
						typeof value === "object" &&
						!(Array.isArray(value) && arrays.has(column))
						? JSON.stringify(value)
						: value,
				),
		};
	}

	protected override dropColumnSql(columnName: string, cascade: boolean | undefined) {
		return `DROP COLUMN ${quotePgIdent(columnName)} ${cascade ? "CASCADE" : "RESTRICT"}`;
	}

	protected override tableRef(tableName: string, schemaName?: string) {
		return qualifiedTable(tableName, schemaName);
	}

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		// A connect or pool checkout timeout and a dropped socket are plain errors, which the log
		// recognises by their fixed messages.
		if (!isPgError(e))
			return UNREACHABLE.has(errorFields(e).error_code ?? "") ? { status: 503 } : undefined;

		if (e.code === "25006") return { status: 403, message: READ_ONLY_MESSAGE };

		// The connected role lacks a privilege, or a row-level security policy refused the row.
		if (e.code === "42501") return { status: 403 };

		// undefined_table: dropped, renamed, or a stale URL after switching databases.
		if (e.code === "42P01") return { status: 404 };

		const status = STATUS_BY_SQLSTATE_CLASS[e.code?.slice(0, 2) ?? ""];

		return status ? { status } : undefined;
	}

	override getTableData(params: GetTableDataParams) {
		return this.keysetTableData(params, { filters: pgFilters, keyset: pgKeyset });
	}

	protected override async pageKey(conn: PgQueryable, tableName: string, schemaName?: string) {
		const keys = await this.primaryKey(conn, tableName, schemaName);

		return keys.length ? { keys } : { keys, rowId: "ctid" };
	}

	/**
	 * SELECT * omits ctid and CockroachDB's hidden rowid primary key, so the key columns are
	 * selected by name too. ctid is a reserved system column name, so it cannot shadow a user
	 * column.
	 */
	protected override pageColumns(keys: string[], rowId: string | undefined) {
		return ["*", ...keys.map(quotePgIdent), ...(rowId ? [rowId] : [])].join(", ");
	}

	/** Unfiltered, the planner's estimate and the count are one query. */
	protected override async pageTotal(
		conn: PgQueryable,
		db: string,
		tableName: string,
		schemaName: string | undefined,
		filterWhere: string,
		filterValues: unknown[],
	) {
		if (filterWhere)
			return super.pageTotal(conn, db, tableName, schemaName, filterWhere, filterValues);

		const table = qualifiedTable(tableName, schemaName);

		// The COUNT(*) subquery only runs when the CASE reaches it.
		const { rows } = await conn.query(
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

	protected columnDefinition(
		_conn: PgQueryable,
		_tableName: string,
		field: FieldDataType,
		createKey?: string[],
	) {
		let def = `${quotePgIdent(field.columnName)} ${field.columnType}`;

		if (field.isArray) def += "[]";

		if (field.isPrimaryKey && (!createKey || createKey.length === 1)) def += " PRIMARY KEY";

		if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";

		if (!field.isNullable) def += " NOT NULL";

		if (field.isIdentity) def += " GENERATED ALWAYS AS IDENTITY";

		if (field.defaultValue?.trim() && !field.isIdentity)
			def += ` DEFAULT ${field.defaultValue.trim()}`;

		return def;
	}

	protected override readonly foreignKeyName = fullForeignKeyName;

	/**
	 * Compared by schema too: without `schemaName` the table resolves through search_path, and a
	 * same-named table of another schema that references it is not a self-reference.
	 */
	protected override async otherTablesReferencing(
		conn: PgQueryable,
		tableName: string,
		schemaName?: string,
	) {
		const [own] = await this.rows<{ schema: string }>(
			conn,
			`SELECT n.nspname AS "schema" FROM pg_catalog.pg_class c
			 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = $1::regclass`,
			[qualifiedTable(tableName, schemaName)],
		);

		return (await this.referencingKeys(conn, tableName, schemaName)).filter(
			(fk) => fk.table !== tableName || fk.schema !== own?.schema,
		);
	}

	protected override async dropTable(
		conn: PgQueryable,
		{ tableName, schemaName, cascade }: DeleteTableParams,
	) {
		await conn.query(
			`DROP TABLE ${qualifiedTable(tableName, schemaName)} ${cascade ? "CASCADE" : "RESTRICT"}`,
		);
	}

	/** A view or another object depends on the table. */
	protected override isDropRefused(e: unknown) {
		return isPgError(e) && e.code === "2BP01";
	}

	/** The new name must be free in the table's own schema, so a bare name resolves first. */
	override async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		if (params.schemaName) return super.renameTable(params);

		const [row] = await this.rows<{ schema: string | null }>(
			await connector("pg").pool(params.db),
			`SELECT ${schemaOf("$1", "$2")} AS schema`,
			[params.tableName, null],
		);

		return super.renameTable({ ...params, schemaName: row?.schema ?? undefined });
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

		if (!tableSchema) throw this.tableMissing(tableName);

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

		if (!rows || rows.length === 0) throw this.tableMissing(tableName);

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

		// 42P07: the name is taken.
		if (code === "42P07") return { status: 409 };

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
