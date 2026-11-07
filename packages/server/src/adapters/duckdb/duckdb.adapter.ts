import type {
	AddColumnParamsSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
	FieldDataType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteTableParams,
	IndexInfoSchemaType,
} from "@db-studio/shared/types";
import { isSerialType } from "@db-studio/shared/types";
import type {
	DuckDBConnection,
	DuckDBPreparedStatement,
	DuckDBResultReader,
	DuckDBTypeId,
	DuckDBValue,
	Json,
} from "@duckdb/node-api";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { type DriverErrorClass, READ_ONLY_MESSAGE } from "@/adapters/base.adapter.js";
import {
	type InlineConstraints,
	bulkInserted,
	type ReferencingKey,
	ONE_STATEMENT_MESSAGE,
	SqlAdapter,
	safeNumber,
	type StatementResult,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import { DuckdbFileLocked } from "@/connectors/duckdb.js";
import { loadedDriver } from "@/drivers.js";
import { fileSize } from "@/file-size.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import {
	duckdbFilters,
	duckdbKeyset,
	quoteDuckdbIdent as ident,
	mapColumnTypeToDuckdb,
	mapDuckdbToDataType,
	standardizeDuckdbDataTypeLabel,
} from "./duckdb.query-builder.js";

type Row = Record<string, Json>;

type ForeignKey = ReferencingKey & { referencedTable: string };

type ColumnRow = {
	column_name: string;
	data_type: string;
	is_nullable: boolean;
	column_default: string | null;
};

type IndexRow = {
	index_name: string;
	is_unique: boolean;
	/** Each key as SQL: a bare or quoted column name, or a parenthesised expression. */
	keys: string[];
	sql: string;
};

const IN_CURRENT_SCHEMA =
	"database_name = current_database() AND schema_name = current_schema()";

const isBigInteger = (typeId: DuckDBTypeId) => {
	const { DuckDBTypeId } = loadedDriver("duckdb");

	return (
		typeId === DuckDBTypeId.BIGINT ||
		typeId === DuckDBTypeId.UBIGINT ||
		typeId === DuckDBTypeId.HUGEINT ||
		typeId === DuckDBTypeId.UHUGEINT
	);
};

/**
 * The driver boundary for reads. `getRowObjectsJson()` already renders every DuckDB value
 * JSON-safe (decimals, dates and timestamps as strings, LIST/STRUCT/MAP as JSON), but it
 * renders all 64/128-bit integers as strings; turn the ones that fit a double back into numbers.
 */
const toRows = (reader: DuckDBResultReader): Row[] => {
	const types = reader.columnTypes();
	const bigColumns = reader.columnNames().filter((_, i) => isBigInteger(types[i].typeId));
	const rows = reader.getRowObjectsJson();

	for (const row of rows) {
		for (const column of bigColumns) {
			row[column] = safeNumber(row[column]);
		}
	}

	return rows;
};

/** The driver boundary for writes. DuckDB casts the bound value to the column type. */
const toDuckdbValue = (value: unknown): DuckDBValue => {
	if (value === null || value === undefined) return null;

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	)
		return value;

	if (value instanceof Date) return value.toISOString();

	return JSON.stringify(value);
};

const query = async <T extends Row = Row>(
	conn: DuckDBConnection,
	sql: string,
	values: unknown[] = [],
): Promise<T[]> => toRows(await conn.runAndReadAll(sql, values.map(toDuckdbValue))) as T[];

const inTransaction = async <T>(conn: DuckDBConnection, fn: () => Promise<T>): Promise<T> => {
	await conn.run("BEGIN TRANSACTION");

	try {
		const result = await fn();
		await conn.run("COMMIT");

		return result;
	} catch (e) {
		await conn.run("ROLLBACK").catch(() => {});
		throw e;
	}
};

const sequenceNamesIn = (columns: ColumnRow[]) =>
	columns.flatMap((c) =>
		[...(c.column_default ?? "").matchAll(/nextval\('([^']+)'\)/g)].map((m) => m[1]),
	);

/** DuckDB limitations that surface as engine errors; each maps to a 400 with a readable reason. */
const LIMITATIONS: Array<[signature: string, reason: string]> = [
	[
		"Dependency Error",
		"DuckDB cannot alter or rename a table that another table's foreign key references or that has an index. Drop the referencing table or the index first.",
	],
	[
		"has a CHECK constraint",
		"DuckDB cannot change the type of a column that has a CHECK constraint.",
	],
	[
		"an index depends on it",
		"DuckDB cannot alter or drop a column covered by an index, primary key or unique constraint.",
	],
];

const FK_ACTIONS_DUCKDB_REJECTS = new Set(["CASCADE", "SET NULL", "SET DEFAULT"]);

/** The `<table>_<column>_seq` sequence an identity or serial column takes its default from. */
const sequenceOf = (
	tableName: string,
	{ columnName, columnType, isIdentity }: FieldDataType,
) => (isIdentity || isSerialType(columnType) ? `${tableName}_${columnName}_seq` : null);

export class DuckDbAdapter extends SqlAdapter<DuckDBConnection> {
	protected readonly quoteIdentifier = ident;
	protected readonly engine = "duckdb";
	protected readonly placeholder = () => "?";

	protected connect<T>(_db: string, work: (conn: DuckDBConnection) => Promise<T>) {
		return connector("duckdb").withConnection(work);
	}

	protected rows<T>(conn: DuckDBConnection, sql: string, values: unknown[] = []) {
		return query(conn, sql, values) as Promise<T[]>;
	}

	protected async execute(conn: DuckDBConnection, sql: string, values: unknown[] = []) {
		return (await conn.runAndReadAll(sql, values.map(toDuckdbValue))).rowsChanged;
	}

	protected transaction<T>(db: string, work: (conn: DuckDBConnection) => Promise<T>) {
		return this.connect(db, (conn) => inTransaction(conn, () => work(conn)));
	}

	protected isFkViolation(e: unknown) {
		return e instanceof Error && e.message.includes("Violates foreign key constraint");
	}

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		const limitation = LIMITATIONS.find(([signature]) => e.message.includes(signature));

		if (limitation) return { status: 400, message: `${limitation[1]} (${e.message})` };

		if (e.message.includes("attached in read-only mode"))
			return { status: 403, message: READ_ONLY_MESSAGE };

		if (e instanceof DuckdbFileLocked) return { status: 503 };

		// DuckDB names an error's class first: a duplicate, foreign key, NOT NULL or CHECK
		// violation is a "Constraint Error", a value the type cannot hold a "Conversion Error".
		if (e.message.startsWith("Constraint Error")) return { status: 409 };

		if (/^(Conversion|Out of Range) Error/.test(e.message)) return { status: 400 };

		return undefined;
	}

	override getTableData(params: GetTableDataParams) {
		return this.keysetTableData(params, { filters: duckdbFilters, keyset: duckdbKeyset });
	}

	protected override async pageKey(conn: DuckDBConnection, tableName: string) {
		await this.requireTable(conn, tableName);
		const keys = await this.primaryKey(conn, tableName);

		return keys.length ? { keys } : { keys, rowId: "rowid" };
	}

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		return connector("duckdb").withConnection(async (conn) => {
			const rows = await query<{ database_name: string; path: string | null }>(
				conn,
				"SELECT database_name, path FROM duckdb_databases() WHERE database_name = current_database()",
			);

			return rows.map((row) => ({
				name: row.database_name,
				size: fileSize(row.path ?? ""),
				owner: "",
				encoding: "UTF-8",
			}));
		});
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return connector("duckdb").withConnection(async (conn) => {
			const [row] = await query<{ db: string }>(conn, "SELECT current_database() AS db");

			return { db: row.db };
		});
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		return connector("duckdb").withConnection(async (conn) => {
			const [row] = await query<{ db: string; version: string }>(
				conn,
				"SELECT current_database() AS db, version() AS version",
			);

			return {
				host: null,
				port: null,
				user: "",
				database: row.db,
				version: `DuckDB ${row.version}`,
				active_connections: 1,
				max_connections: 1,
			};
		});
	}

	/** Every table is counted, in one statement: the connection runs one query at a time. */
	protected readonly countStatements = 1;

	/** DuckDB keeps no row estimates, so every table is counted, and one table has none to read. */
	protected async tableEstimates(conn: DuckDBConnection, _db: string, tableName?: string) {
		if (tableName !== undefined) return [];

		return this.rows<TableEstimate>(
			conn,
			`SELECT table_name AS "tableName" FROM duckdb_tables() WHERE ${IN_CURRENT_SCHEMA} AND NOT temporary ORDER BY table_name`,
		);
	}

	override async createTable(params: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		for (const fk of params.tableData.foreignKeys ?? []) {
			const rejected = [fk.onUpdate, fk.onDelete].find((a) =>
				FK_ACTIONS_DUCKDB_REJECTS.has(a),
			);

			if (rejected)
				throw new HTTPException(400, {
					message: `DuckDB foreign keys do not support ${rejected} (on "${fk.columnName}"). Use NO ACTION or RESTRICT.`,
				});
		}

		return super.createTable(params);
	}

	protected columnDefinition(
		_conn: DuckDBConnection,
		tableName: string,
		field: FieldDataType,
		{ inlineKey, inlineUnique }: InlineConstraints,
	) {
		const sequence = sequenceOf(tableName, field);
		let def = `${ident(field.columnName)} ${mapColumnTypeToDuckdb(field.columnType, field.isArray)}`;

		if (inlineKey) def += " PRIMARY KEY";

		if (inlineUnique) def += " UNIQUE";

		if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

		if (sequence) def += ` DEFAULT nextval('${sequence.replaceAll("'", "''")}')`;
		else if (field.defaultValue?.trim()) def += ` DEFAULT ${field.defaultValue.trim()}`;

		return def;
	}

	protected override runCreateTable(
		conn: DuckDBConnection,
		sql: string,
		{ tableName, fields }: CreateTableSchemaType,
	) {
		return inTransaction(conn, async () => {
			for (const field of fields) {
				const sequence = sequenceOf(tableName, field);

				if (sequence) await conn.run(`CREATE SEQUENCE ${ident(sequence)}`);
			}

			await conn.run(sql);
		});
	}

	/** The table's `<table>_<column>_seq` sequences go with it. */
	protected override async dropTable(
		conn: DuckDBConnection,
		{ tableName }: DeleteTableParams,
		referencing: ReferencingKey[],
	) {
		if (referencing.length)
			throw new HTTPException(400, {
				message: `DuckDB cannot drop "${tableName}" while ${[...new Set(referencing.map((fk) => `"${fk.table}"`))].join(", ")} reference it, and it cannot remove those foreign keys. Delete the referencing tables first.`,
			});

		const columns = await this.columns(conn, tableName);
		await conn.run(`DROP TABLE ${ident(tableName)}`);

		for (const sequence of sequenceNamesIn(columns)) {
			// A sequence another table still uses stays; DuckDB refuses with a Dependency Error.
			await conn.run(`DROP SEQUENCE IF EXISTS ${ident(sequence)}`).catch(() => {});
		}
	}

	async getTableSchema({ tableName }: { tableName: string }): Promise<string> {
		return connector("duckdb").withConnection(async (conn) => {
			const [row] = await query<{ sql: string }>(
				conn,
				`SELECT sql FROM duckdb_tables() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ?`,
				[tableName],
			);

			if (!row) throw this.tableMissing(tableName);

			return row.sql;
		});
	}

	async getTableColumns({
		tableName,
	}: {
		tableName: string;
	}): Promise<ColumnInfoSchemaType[]> {
		return connector("duckdb").withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			const primaryKey = new Set(await this.primaryKey(conn, tableName));

			const references = new Map(
				(await this.foreignKeys(conn, "table_name", tableName)).flatMap((fk) =>
					fk.columns.map((column, i) => [
						column,
						{ table: fk.referencedTable, column: fk.referencedColumns[i] },
					]),
				),
			);

			return columns.map((col) => {
				const fk = references.get(col.column_name);
				const isPrimaryKey = primaryKey.has(col.column_name);

				return {
					columnName: col.column_name,
					dataType: mapDuckdbToDataType(col.data_type),
					dataTypeLabel: standardizeDuckdbDataTypeLabel(col.data_type),
					isNullable: col.is_nullable && !isPrimaryKey,
					columnDefault: col.column_default,
					isPrimaryKey,
					isForeignKey: !!fk,
					referencedTable: fk?.table ?? null,
					referencedColumn: fk?.column ?? null,
					enumValues: col.data_type.startsWith("ENUM(")
						? [...col.data_type.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
								m[1].replaceAll("''", "'"),
							)
						: null,
				};
			});
		});
	}

	override async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, isNullable, isUnique, isPrimaryKey } = params;

		if (isUnique || isPrimaryKey)
			throw new HTTPException(400, {
				message: `DuckDB cannot add a ${isPrimaryKey ? "PRIMARY KEY" : "UNIQUE"} column to an existing table. Add the column without it, or recreate the table.`,
			});

		const sequence = sequenceOf(tableName, params);

		await connector("duckdb").withConnection(async (conn) => {
			this.assertColumnAbsent(await this.requireTable(conn, tableName), tableName, columnName);

			// DuckDB rejects constraints inside ADD COLUMN, so NOT NULL is applied afterwards.
			const definition = this.columnDefinition(
				conn,
				tableName,
				{ ...params, isNullable: true },
				{ inlineKey: false, inlineUnique: false },
			);

			await inTransaction(conn, async () => {
				if (sequence) await conn.run(`CREATE SEQUENCE ${ident(sequence)}`);
				await conn.run(`ALTER TABLE ${ident(tableName)} ADD COLUMN ${definition}`);

				if (!isNullable)
					await conn
						.run(
							`ALTER TABLE ${ident(tableName)} ALTER COLUMN ${ident(columnName)} SET NOT NULL`,
						)
						.catch((e) => {
							if (!String(e).includes("NOT NULL constraint failed")) throw e;
							throw new HTTPException(400, {
								message: `Column "${columnName}" needs a default value to be NOT NULL, because "${tableName}" already has rows.`,
							});
						});
			});
		});
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue } = params;
		const alter = `ALTER TABLE ${ident(tableName)} ALTER COLUMN ${ident(columnName)}`;
		await connector("duckdb").withConnection(async (conn) => {
			await this.requireColumn(conn, tableName, columnName);
			await inTransaction(conn, async () => {
				await conn.run(`${alter} TYPE ${mapColumnTypeToDuckdb(columnType, false)}`);
				await conn.run(`${alter} ${isNullable ? "DROP" : "SET"} NOT NULL`);
				await conn.run(
					defaultValue?.trim()
						? `${alter} SET DEFAULT ${defaultValue.trim()}`
						: `${alter} DROP DEFAULT`,
				);
			});
		});
	}

	async forceDeleteRecords(params: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const result = await this.deleteRecords(params);

		if (result.fkViolation) {
			throw new HTTPException(400, {
				message:
					"DuckDB cannot atomically delete a row and its dependent rows. Delete the dependent rows explicitly, then retry. Nothing was deleted.",
			});
		}

		return { deletedCount: result.deletedCount };
	}

	async bulkInsertRecords({
		tableName,
		records,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		const successCount = await connector("duckdb").withConnection((conn) =>
			inTransaction(conn, async () => {
				const insert = await this.inserter(conn, "", tableName, undefined);
				// One prepared statement per INSERT the records need: each names only its own
				// columns.
				const statements = new Map<string, DuckDBPreparedStatement>();

				for (const [i, record] of records.entries()) {
					const { sql, values } = insert(record);
					const statement = statements.get(sql) ?? (await conn.prepare(sql));

					statements.set(sql, statement);
					statement.bind(values.map(toDuckdbValue));

					try {
						await statement.run();
					} catch (error) {
						throw this.recordInsertFailure(error, i);
					}
				}

				return records.length;
			}),
		);

		return bulkInserted(successCount);
	}

	protected async runStatement(conn: DuckDBConnection, sql: string): Promise<StatementResult> {
		const { ResultReturnType, StatementType } = loadedDriver("duckdb");
		const statements = await conn.extractStatements(sql);

		if (statements.count !== 1) {
			throw new HTTPException(400, { message: ONE_STATEMENT_MESSAGE });
		}

		const statement = await statements.prepare(0);

		try {
			if (statement.statementType === StatementType.TRANSACTION) {
				throw new HTTPException(400, {
					message:
						"Transactions cannot span query-runner requests. BEGIN, COMMIT, and ROLLBACK are not supported.",
				});
			}

			const reader = await statement.runAndReadAll();

			if (reader.returnType === ResultReturnType.CHANGED_ROWS)
				return { affected: reader.rowsChanged };

			if (reader.returnType === ResultReturnType.NOTHING) return { affected: undefined };

			return { columns: reader.columnNames(), rows: toRows(reader) };
		} finally {
			statement.destroySync();
		}
	}

	private columns(conn: DuckDBConnection, tableName: string): Promise<ColumnRow[]> {
		return query<ColumnRow>(
			conn,
			`SELECT column_name, data_type, is_nullable, column_default FROM duckdb_columns() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ? ORDER BY column_index`,
			[tableName],
		);
	}

	private async requireColumns(
		conn: DuckDBConnection,
		tableName: string,
	): Promise<ColumnRow[]> {
		const columns = await this.columns(conn, tableName);

		if (!columns.length) throw this.tableMissing(tableName);

		return columns;
	}

	protected async columnNames(conn: DuckDBConnection, tableName: string) {
		const columns = await this.columns(conn, tableName);

		return columns.length ? columns.map((c) => c.column_name) : undefined;
	}

	protected override indexError(e: Error) {
		// The name is taken.
		return e.message.includes("already exists") ? { status: 409 } : undefined;
	}

	/** The indexes behind PRIMARY KEY and UNIQUE constraints are not listed: all are droppable. */
	protected async listIndexes(
		conn: DuckDBConnection,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.requireTable(conn, tableName);

		const rows = await query<IndexRow>(
			conn,
			`SELECT index_name, is_unique, expressions::VARCHAR[] AS keys, sql FROM duckdb_indexes() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ? ORDER BY index_name`,
			[tableName],
		);

		return rows.map((row) => ({
			indexName: row.index_name,
			columns: row.keys.map((key) =>
				key.startsWith('"')
					? key.slice(1, -1).replaceAll('""', '"')
					: key.startsWith("(")
						? key.slice(1, -1)
						: key,
			),
			isUnique: row.is_unique,
			method: null,
			kind: "index",
			definition: row.keys.some((key) => key.startsWith("(")) ? row.sql : null,
		}));
	}

	protected async primaryKey(conn: DuckDBConnection, tableName: string): Promise<string[]> {
		const [row] = await query<{ columns: string[] }>(
			conn,
			`SELECT constraint_column_names AS columns FROM duckdb_constraints() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ? AND constraint_type = 'PRIMARY KEY'`,
			[tableName],
		);

		return row?.columns ?? [];
	}

	protected referencingKeys(conn: DuckDBConnection, tableName: string) {
		return this.foreignKeys(conn, "referenced_table", tableName);
	}

	/** Foreign keys declared on `tableName` ("table_name") or pointing at it ("referenced_table"). */
	private async foreignKeys(
		conn: DuckDBConnection,
		side: "table_name" | "referenced_table",
		tableName: string,
	): Promise<ForeignKey[]> {
		return this.rows<ForeignKey>(
			conn,
			`SELECT constraint_name AS "constraintName", table_name AS "table", constraint_column_names AS "columns", referenced_table AS "referencedTable", referenced_column_names AS "referencedColumns" FROM duckdb_constraints() WHERE ${IN_CURRENT_SCHEMA} AND constraint_type = 'FOREIGN KEY' AND ${side} = ?`,
			[tableName],
		);
	}
}
