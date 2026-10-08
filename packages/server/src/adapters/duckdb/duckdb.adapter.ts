import { statSync } from "node:fs";
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
import { mapDuckdbToDataType, standardizeDuckdbDataTypeLabel } from "@db-studio/shared/types";
import {
	type DuckDBConnection,
	type DuckDBResultReader,
	DuckDBTypeId,
	type DuckDBValue,
	type Json,
	ResultReturnType,
	StatementType,
} from "@duckdb/node-api";
import { HTTPException } from "hono/http-exception";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { withDuckdbConnection } from "@/adapters/connections.js";
import {
	buildFilterConditions,
	buildKeysetPredicate,
	buildOrderBy,
	quoteDuckdbIdent as ident,
	isSerialType,
	mapColumnTypeToDuckdb,
	type OrderTerm,
	whereSql,
} from "./duckdb.query-builder.js";

type Row = Record<string, Json>;

/** One FOREIGN KEY constraint; composite keys keep their columns together, in order. */
type ForeignKey = {
	constraintName: string;
	table: string;
	columns: string[];
	referencedTable: string;
	referencedColumns: string[];
};

type ColumnRow = {
	column_name: string;
	data_type: string;
	is_nullable: boolean;
	column_default: string | null;
};

const IN_CURRENT_SCHEMA =
	"database_name = current_database() AND schema_name = current_schema()";

const BIG_INTEGER_TYPES = new Set<DuckDBTypeId>([
	DuckDBTypeId.BIGINT,
	DuckDBTypeId.UBIGINT,
	DuckDBTypeId.HUGEINT,
	DuckDBTypeId.UHUGEINT,
]);

/**
 * The driver boundary for reads. `getRowObjectsJson()` already renders every DuckDB value
 * JSON-safe (decimals, dates and timestamps as strings, LIST/STRUCT/MAP as JSON), but it
 * renders all 64/128-bit integers as strings; turn the ones that fit a double back into numbers.
 */
const toRows = (reader: DuckDBResultReader): Row[] => {
	const types = reader.columnTypes();
	const bigColumns = reader
		.columnNames()
		.filter((_, i) => BIG_INTEGER_TYPES.has(types[i].typeId));
	const rows = reader.getRowObjectsJson();
	for (const row of rows) {
		for (const column of bigColumns) {
			const value = row[column];
			if (typeof value === "string" && Number.isSafeInteger(Number(value)))
				row[column] = Number(value);
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

const execute = async (conn: DuckDBConnection, sql: string, values: unknown[] = []) =>
	(await conn.runAndReadAll(sql, values.map(toDuckdbValue))).rowsChanged;

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

const placeholders = (values: unknown[]) => values.map(() => "?").join(", ");

/** Join condition from a referencing row `c` to the referenced row `p`. */
const joinOn = (fk: ForeignKey) =>
	fk.columns
		.map((c, i) => `c.${ident(c)} = p.${ident(fk.referencedColumns[i])}`)
		.join(" AND ");

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

export class DuckDbAdapter extends BaseAdapter {
	// =========================================================
	// Abstract method implementations
	// =========================================================

	protected async runQuery<T>(_db: string, sql: string, values: unknown[]): Promise<T> {
		return withDuckdbConnection((conn) => query(conn, sql, values)) as Promise<T>;
	}

	protected quoteIdentifier(name: string): string {
		return ident(name);
	}

	mapToUniversalType(nativeType: string): DataTypes {
		return mapDuckdbToDataType(nativeType);
	}

	mapFromUniversalType(universalType: string): string {
		const map: Record<string, string> = {
			text: "VARCHAR",
			number: "DOUBLE",
			boolean: "BOOLEAN",
			json: "JSON",
			date: "TIMESTAMP",
			array: "VARCHAR[]",
			enum: "VARCHAR",
		};
		return map[universalType] ?? "VARCHAR";
	}

	// getTableData is overridden: keyset pagination needs the table's key columns and column
	// types, which the synchronous template hooks cannot look up.
	protected buildTableDataQuery(_params: GetTableDataParams): QueryBundle {
		throw new Error("DuckDbAdapter.getTableData builds its own query");
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return (rawRows as Row[]).map((row) => this.normalizeRow(row));
	}

	protected buildCursors(): { nextCursor: string | null; prevCursor: string | null } {
		throw new Error("DuckDbAdapter.getTableData builds its own cursors");
	}

	protected override wrapError(e: unknown): HTTPException {
		if (e instanceof Error) {
			const limitation = LIMITATIONS.find(([signature]) => e.message.includes(signature));
			if (limitation)
				return new HTTPException(400, {
					message: `${limitation[1]} (${e.message})`,
					cause: e,
				});
		}
		return super.wrapError(e);
	}

	private withConnection<T>(fn: (conn: DuckDBConnection) => Promise<T>): Promise<T> {
		return withDuckdbConnection(fn).catch((e) => {
			throw this.wrapError(e);
		});
	}

	// =========================================================
	// Records — paginated read
	// =========================================================

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const {
			tableName,
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			cursor,
			filters = [],
		} = params;

		return this.withConnection(async (conn) => {
			await this.requireColumns(conn, tableName);
			const primaryKey = await this.primaryKey(conn, tableName);
			const keyColumns = primaryKey.length ? primaryKey : ["rowid"];

			const sorts: SortType[] =
				typeof sort === "string"
					? sort
						? [{ columnName: sort, direction: order }]
						: []
					: sort;
			const sortDirection = sorts[0]?.direction ?? order;
			const terms: OrderTerm[] = [
				...sorts.map((s) => ({ column: s.columnName, direction: s.direction })),
				...keyColumns
					.filter((key) => !sorts.some((s) => s.columnName === key))
					.map((column) => ({ column, direction: sortDirection })),
			];

			const backward = direction === "desc";
			const filter = buildFilterConditions(filters);
			const cursorData = cursor ? this.decodeCursor(cursor) : null;
			const keyset = cursorData
				? buildKeysetPredicate(terms, cursorData.values, backward)
				: null;
			const orderBy = buildOrderBy(terms, backward);
			const select = primaryKey.length ? "*" : "*, rowid";
			const where = whereSql(
				keyset ? [...filter.conditions, keyset.clause] : filter.conditions,
			);

			const [countRow] = await query(
				conn,
				`SELECT COUNT(*) AS total FROM ${ident(tableName)} ${whereSql(filter.conditions)}`,
				filter.values,
			);
			const fetched = await query(
				conn,
				`SELECT ${select} FROM ${ident(tableName)} ${where} ${orderBy} LIMIT ?`,
				[...filter.values, ...(keyset?.values ?? []), limit + 1],
			);

			const hasMore = fetched.length > limit;
			const page = fetched.slice(0, limit);
			if (backward) page.reverse();

			const cursorOf = (row: Row) =>
				this.encodeCursor({
					values: Object.fromEntries(terms.map((t) => [t.column, row[t.column]])),
					sortColumns: terms.map((t) => t.column),
				});
			const first = page[0];
			const last = page.at(-1);
			const hasNextPage = backward ? !!cursor : hasMore;
			const hasPreviousPage = backward ? hasMore : !!cursor;

			return {
				data: page.map((row) => {
					if (primaryKey.length) return this.normalizeRow(row);
					const { rowid: _rowid, ...rest } = row;
					return this.normalizeRow(rest);
				}),
				meta: {
					limit,
					total: Number(countRow?.total ?? 0),
					hasNextPage,
					hasPreviousPage,
					nextCursor: hasNextPage && last ? cursorOf(last) : null,
					prevCursor: hasPreviousPage && first ? cursorOf(first) : null,
				},
			};
		});
	}

	// =========================================================
	// Databases
	// =========================================================

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const rows = await query<{ database_name: string; path: string | null }>(
				conn,
				"SELECT database_name, path FROM duckdb_databases() WHERE database_name = current_database()",
			);
			return rows.map((row) => ({
				name: row.database_name,
				size: this.getFileSize(row.path),
				owner: "",
				encoding: "UTF-8",
			}));
		});
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return this.withConnection(async (conn) => {
			const [row] = await query<{ db: string }>(conn, "SELECT current_database() AS db");
			return { db: row.db };
		});
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		return this.withConnection(async (conn) => {
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

	// =========================================================
	// Tables
	// =========================================================

	async getTablesList(_db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		return this.withConnection(async (conn) => {
			const tables = await query<{ table_name: string }>(
				conn,
				`SELECT table_name FROM duckdb_tables() WHERE ${IN_CURRENT_SCHEMA} AND NOT temporary ORDER BY table_name`,
			);
			const result: TableInfoSchemaType[] = [];
			for (const { table_name } of tables) {
				const [row] = await query<{ count: number }>(
					conn,
					`SELECT COUNT(*) AS count FROM ${ident(table_name)}`,
				);
				result.push({ tableName: table_name, rowCount: Number(row?.count ?? 0) });
			}
			return result;
		});
	}

	async createTable({ tableData }: { tableData: CreateTableSchemaType }): Promise<void> {
		const { tableName, fields, foreignKeys = [] } = tableData;

		for (const fk of foreignKeys) {
			const rejected = [fk.onUpdate, fk.onDelete].find((a) =>
				FK_ACTIONS_DUCKDB_REJECTS.has(a),
			);
			if (rejected)
				throw new HTTPException(400, {
					message: `DuckDB foreign keys do not support ${rejected} (on "${fk.columnName}"). Use NO ACTION or RESTRICT.`,
				});
		}

		const sequences: string[] = [];
		const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);
		const columnDefs = fields.map((field) => {
			let def = `${ident(field.columnName)} ${mapColumnTypeToDuckdb(field.columnType, field.isArray)}`;
			if (primaryKey.length === 1 && field.isPrimaryKey) def += " PRIMARY KEY";
			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
			if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";
			if (field.isIdentity || isSerialType(field.columnType)) {
				const sequence = `${tableName}_${field.columnName}_seq`;
				sequences.push(sequence);
				def += ` DEFAULT nextval('${sequence.replaceAll("'", "''")}')`;
			} else if (field.defaultValue?.trim()) {
				def += ` DEFAULT ${field.defaultValue.trim()}`;
			}
			return def;
		});
		if (primaryKey.length > 1)
			columnDefs.push(`PRIMARY KEY (${primaryKey.map(ident).join(", ")})`);
		const fkDefs = foreignKeys.map(
			(fk) =>
				`FOREIGN KEY (${ident(fk.columnName)}) REFERENCES ${ident(fk.referencedTable)} (${ident(fk.referencedColumn)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`,
		);

		await this.withConnection((conn) =>
			inTransaction(conn, async () => {
				for (const sequence of sequences) await conn.run(`CREATE SEQUENCE ${ident(sequence)}`);
				await conn.run(
					`CREATE TABLE ${ident(tableName)} (${[...columnDefs, ...fkDefs].join(", ")})`,
				);
			}),
		);
	}

	async deleteTable({ tableName, cascade }: DeleteTableParams): Promise<DeleteTableResult> {
		return this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			const referencing = (await this.foreignKeys(conn, "referenced_table", tableName)).filter(
				(fk) => fk.table !== tableName,
			);
			if (referencing.length) {
				if (cascade)
					throw new HTTPException(400, {
						message: `DuckDB cannot drop "${tableName}" while ${[...new Set(referencing.map((fk) => `"${fk.table}"`))].join(", ")} reference it, and it cannot remove those foreign keys. Delete the referencing tables first.`,
					});
				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.sampleReferencingRows(conn, referencing),
				};
			}

			const [row] = await query<{ count: number }>(
				conn,
				`SELECT COUNT(*) AS count FROM ${ident(tableName)}`,
			);
			await conn.run(`DROP TABLE ${ident(tableName)}`);
			for (const sequence of sequenceNamesIn(columns)) {
				// A sequence another table still uses stays; DuckDB refuses with a Dependency Error.
				await conn.run(`DROP SEQUENCE IF EXISTS ${ident(sequence)}`).catch(() => {});
			}
			return { deletedCount: Number(row?.count ?? 0), fkViolation: false, relatedRecords: [] };
		});
	}

	async renameTable({ tableName, newTableName }: RenameTableParamsSchemaType): Promise<void> {
		this.assertDifferentTableName(tableName, newTableName);
		await this.withConnection(async (conn) => {
			await this.requireColumns(conn, tableName);
			if ((await this.columns(conn, newTableName)).length)
				throw new HTTPException(409, { message: `Table "${newTableName}" already exists` });
			await conn.run(`ALTER TABLE ${ident(tableName)} RENAME TO ${ident(newTableName)}`);
		});
	}

	async getTableSchema({ tableName }: { tableName: string }): Promise<string> {
		return this.withConnection(async (conn) => {
			const [row] = await query<{ sql: string }>(
				conn,
				`SELECT sql FROM duckdb_tables() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ?`,
				[tableName],
			);
			if (!row)
				throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
			return row.sql;
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

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const {
			tableName,
			columnName,
			columnType,
			defaultValue,
			isNullable,
			isUnique,
			isPrimaryKey,
		} = params;
		if (isUnique || isPrimaryKey)
			throw new HTTPException(400, {
				message: `DuckDB cannot add a ${isPrimaryKey ? "PRIMARY KEY" : "UNIQUE"} column to an existing table. Add the column without it, or recreate the table.`,
			});

		const sequence =
			params.isIdentity || isSerialType(columnType) ? `${tableName}_${columnName}_seq` : null;
		let def = `${ident(columnName)} ${mapColumnTypeToDuckdb(columnType, params.isArray)}`;
		if (sequence) def += ` DEFAULT nextval('${sequence.replaceAll("'", "''")}')`;
		else if (defaultValue?.trim()) def += ` DEFAULT ${defaultValue.trim()}`;

		await this.withConnection(async (conn) => {
			const columns = await this.requireColumns(conn, tableName);
			if (columns.some((c) => c.column_name === columnName))
				throw new HTTPException(409, {
					message: `Column "${columnName}" already exists in table "${tableName}"`,
				});
			// DuckDB rejects constraints inside ADD COLUMN, so NOT NULL is applied afterwards.
			await inTransaction(conn, async () => {
				if (sequence) await conn.run(`CREATE SEQUENCE ${ident(sequence)}`);
				await conn.run(`ALTER TABLE ${ident(tableName)} ADD COLUMN ${def}`);
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

	async deleteColumn({
		tableName,
		columnName,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		await this.withConnection(async (conn) => {
			await this.requireColumn(conn, tableName, columnName);
			await conn.run(`ALTER TABLE ${ident(tableName)} DROP COLUMN ${ident(columnName)}`);
		});
		return { deletedCount: 1 };
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, defaultValue } = params;
		const alter = `ALTER TABLE ${ident(tableName)} ALTER COLUMN ${ident(columnName)}`;
		await this.withConnection(async (conn) => {
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

	async renameColumn({
		tableName,
		columnName,
		newColumnName,
	}: RenameColumnParamsSchemaType): Promise<void> {
		await this.withConnection(async (conn) => {
			const columns = await this.requireColumn(conn, tableName, columnName);
			if (columns.some((c) => c.column_name === newColumnName))
				throw new HTTPException(409, {
					message: `Column "${newColumnName}" already exists in table "${tableName}"`,
				});
			await conn.run(
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

		const insertedCount = await this.withConnection((conn) =>
			execute(
				conn,
				`INSERT INTO ${ident(tableName)} (${columns.map(ident).join(", ")}) VALUES (${placeholders(columns)})`,
				Object.values(data),
			),
		);
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

		const updatedCount = await this.withConnection((conn) =>
			inTransaction(conn, async () => {
				let total = 0;
				for (const { keyValues, rowUpdates } of groups) {
					const changed = await execute(
						conn,
						`UPDATE ${ident(tableName)} SET ${rowUpdates.map((u) => `${ident(u.columnName)} = ?`).join(", ")} WHERE ${keyColumns.map((c) => `${ident(c)} = ?`).join(" AND ")}`,
						[...rowUpdates.map((u) => u.value), ...keyValues],
					);
					if (changed === 0)
						throw new HTTPException(404, {
							message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
						});
					total += changed;
				}
				return total;
			}),
		);
		return { updatedCount };
	}

	async deleteRecords({
		tableName,
		primaryKeys,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn)
			throw new HTTPException(400, { message: "Primary key column name is required" });
		const values = primaryKeys.map((pk) => pk.value);

		return this.withConnection(async (conn) => {
			try {
				const deletedCount = await execute(
					conn,
					`DELETE FROM ${ident(tableName)} WHERE ${ident(pkColumn)} IN (${placeholders(values)})`,
					values,
				);
				return { deletedCount, fkViolation: false, relatedRecords: [] };
			} catch (e) {
				if (!(e instanceof Error) || !e.message.includes("Violates foreign key constraint"))
					throw e;
				const relatedRecords: RelatedRecord[] = [];
				for (const fk of await this.foreignKeys(conn, "referenced_table", tableName)) {
					const records = await query(
						conn,
						`SELECT c.* FROM ${ident(fk.table)} c JOIN ${ident(tableName)} p ON ${joinOn(fk)} WHERE p.${ident(pkColumn)} IN (${placeholders(values)}) LIMIT 100`,
						values,
					);
					if (records.length)
						relatedRecords.push({
							tableName: fk.table,
							columnName: fk.columns.join(", "),
							constraintName: fk.constraintName,
							records,
						});
				}
				return { deletedCount: 0, fkViolation: true, relatedRecords };
			}
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
		if (!records?.length)
			throw new HTTPException(400, { message: "At least one record is required" });

		const columns = Object.keys(records[0]);
		const successCount = await this.withConnection((conn) =>
			inTransaction(conn, async () => {
				const statement = await conn.prepare(
					`INSERT INTO ${ident(tableName)} (${columns.map(ident).join(", ")}) VALUES (${placeholders(columns)})`,
				);
				for (const record of records) {
					statement.bind(columns.map((col) => toDuckdbValue(record[col])));
					await statement.run();
				}
				return records.length;
			}),
		);
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

	async executeQuery({ query: sql }: { query: string }): Promise<ExecuteQueryResult> {
		if (!sql?.trim()) throw new HTTPException(400, { message: "Query is required" });

		return this.withConnection(async (conn) => {
			const start = performance.now();
			const statements = await conn.extractStatements(sql);
			if (statements.count !== 1) {
				throw new HTTPException(400, {
					message:
						"The query runner runs one statement at a time. Run each statement separately.",
				});
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
				const duration = performance.now() - start;

				if (reader.returnType === ResultReturnType.CHANGED_ROWS)
					return {
						columns: [],
						rows: [],
						rowCount: reader.rowsChanged,
						duration,
						message: `OK (${reader.rowsChanged} rows affected)`,
					};
				if (reader.returnType === ResultReturnType.NOTHING)
					return { columns: [], rows: [], rowCount: 0, duration, message: "OK" };

				const rows = toRows(reader);
				return {
					columns: reader.columnNames(),
					rows,
					rowCount: rows.length,
					duration,
					message: rows.length === 0 ? "OK" : undefined,
				};
			} finally {
				statement.destroySync();
			}
		});
	}

	// =========================================================
	// Private helpers
	// =========================================================

	private getFileSize(filePath: string | null): string {
		if (!filePath) return "in-memory";
		try {
			const bytes = statSync(filePath).size;
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		} catch {
			return "N/A";
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
		if (!columns.length)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
		return columns;
	}

	private async requireColumn(
		conn: DuckDBConnection,
		tableName: string,
		columnName: string,
	): Promise<ColumnRow[]> {
		const columns = await this.requireColumns(conn, tableName);
		if (!columns.some((c) => c.column_name === columnName))
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});
		return columns;
	}

	private async primaryKey(conn: DuckDBConnection, tableName: string): Promise<string[]> {
		const [row] = await query<{ columns: string[] }>(
			conn,
			`SELECT constraint_column_names AS columns FROM duckdb_constraints() WHERE ${IN_CURRENT_SCHEMA} AND table_name = ? AND constraint_type = 'PRIMARY KEY'`,
			[tableName],
		);
		return row?.columns ?? [];
	}

	/** Foreign keys declared on `tableName` ("table_name") or pointing at it ("referenced_table"). */
	private async foreignKeys(
		conn: DuckDBConnection,
		side: "table_name" | "referenced_table",
		tableName: string,
	): Promise<ForeignKey[]> {
		return query<ForeignKey>(
			conn,
			`SELECT constraint_name AS "constraintName", table_name AS "table", constraint_column_names AS "columns", referenced_table AS "referencedTable", referenced_column_names AS "referencedColumns" FROM duckdb_constraints() WHERE ${IN_CURRENT_SCHEMA} AND constraint_type = 'FOREIGN KEY' AND ${side} = ?`,
			[tableName],
		);
	}

	private async sampleReferencingRows(
		conn: DuckDBConnection,
		references: ForeignKey[],
	): Promise<RelatedRecord[]> {
		const related: RelatedRecord[] = [];
		for (const fk of references) {
			const records = await query(
				conn,
				`SELECT * FROM ${ident(fk.table)} WHERE ${fk.columns.map((c) => `${ident(c)} IS NOT NULL`).join(" AND ")} LIMIT 100`,
			);
			if (records.length)
				related.push({
					tableName: fk.table,
					columnName: fk.columns.join(", "),
					constraintName: fk.constraintName,
					records,
				});
		}
		return related;
	}
}
