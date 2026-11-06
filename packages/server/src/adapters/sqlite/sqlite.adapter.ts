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
	DeleteRecordParams,
	DropIndexParamsSchemaType,
	FieldDataType,
	ForeignKeyDataType,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { mapSqliteToDataType, standardizeSqliteDataTypeLabel } from "@db-studio/shared/types";
import type { Value } from "@libsql/client";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { type DriverErrorClass, type NormalizedRow } from "@/adapters/base.adapter.js";
import { decodeCursor } from "@/adapters/cursor.js";
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
	ONE_STATEMENT_MESSAGE,
	SqlAdapter,
	type TableEstimate,
} from "@/adapters/sql.adapter.js";
import { D1TokenRefused } from "@/d1-client.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import type { SqliteClient, SqlParam, SqlResult, SqlStatement } from "@/sqlite-client.js";
import {
	hasMultipleStatements,
	isTransactionControl,
	quoteSqliteIdent,
	recreateTableWithColumn,
	sqliteFilters,
	sqliteKeyset,
} from "./sqlite.query-builder.js";

interface TableInfoRow {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

interface FkRow {
	id: number;
	seq: number;
	table: string;
	from: string;
	/** null when the constraint references the parent's primary key implicitly */
	to: string | null;
	on_update: string;
	on_delete: string;
}

interface IndexKeyRow {
	indexName: string;
	isUnique: number;
	/** c: CREATE INDEX, u: UNIQUE constraint, pk: PRIMARY KEY */
	origin: string;
	partial: number;
	sql: string | null;
	seqno: number;
	/** -2 marks an expression key, which has no column name */
	cid: number;
	columnName: string | null;
}

const QUOTE_END: Record<string, string> = { "'": "'", '"': '"', "`": "`", "[": "]" };

/**
 * The key list of a CREATE INDEX statement, split at its top-level commas. PRAGMA index_xinfo
 * names no expression keys, so their text has to come from the statement itself.
 */
const indexKeyParts = (sql: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = -1;

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i] ?? "";
		const end = QUOTE_END[char];

		if (end) {
			i = sql.indexOf(end, i + 1);

			if (i === -1) break;
		} else if (char === "-" && sql[i + 1] === "-") {
			i = sql.indexOf("\n", i + 2);

			if (i === -1) break;
		} else if (char === "/" && sql[i + 1] === "*") {
			const endComment = sql.indexOf("*/", i + 2);

			if (endComment === -1) break;
			i = endComment + 1;
		} else if (char === "(") {
			if (depth++ === 0) start = i + 1;
		} else if (char === ")" && --depth === 0) {
			parts.push(sql.slice(start, i).trim());
			break;
		} else if (char === "," && depth === 1) {
			parts.push(sql.slice(start, i).trim());
			start = i + 1;
		}
	}

	return parts;
};

const toSqliteValue = (value: unknown): SqlParam => {
	if (value === null || value === undefined) return null;

	if (typeof value === "boolean") return value ? 1 : 0;

	if (typeof value === "string" || typeof value === "number" || typeof value === "bigint")
		return value;

	if (value instanceof Date) return value.toISOString();

	return JSON.stringify(value);
};

const stmt = (sql: string, values: unknown[] = []): SqlStatement => ({
	sql,
	args: values.map(toSqliteValue),
});

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// The client runs in intMode "bigint" so integers past 2^53 don't throw; JSON can't carry
// bigint or ArrayBuffer, and the export writer renders Buffers as hex.
const fromSqliteValue = (value: Value): string | number | Buffer | null => {
	if (typeof value === "bigint")
		return value >= MIN_SAFE && value <= MAX_SAFE ? Number(value) : value.toString();

	if (value instanceof ArrayBuffer) return Buffer.from(value);

	return value;
};

const toRows = <T = Record<string, unknown>>({ columns, rows }: SqlResult): T[] =>
	rows.map(
		(row) => Object.fromEntries(columns.map((col, i) => [col, fromSqliteValue(row[i])])) as T,
	);

const all = async <T = Record<string, unknown>>(
	client: SqliteClient,
	sql: string,
	values: unknown[] = [],
): Promise<T[]> => toRows<T>(await client.execute(stmt(sql, values)));

export class SqliteAdapter extends SqlAdapter<SqliteClient> {
	// alterColumn reads the column list and then rebuilds the table from it; a column added
	// between the two would be dropped by the rebuild, so column changes run one at a time.
	private schemaChange: Promise<unknown> = Promise.resolve();

	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		// libSQL / Turso answer a bad or missing authToken with HTTP 401 or 403.
		if (e instanceof D1TokenRefused || /HTTP status (401|403)\b/.test(e.message))
			return { status: 503 };

		return undefined;
	}

	private serializeSchemaChange<T>(change: () => Promise<T>): Promise<T> {
		const run = this.schemaChange.then(change);
		this.schemaChange = run.catch(() => {});

		return run;
	}

	protected readonly quoteIdentifier = quoteSqliteIdent;
	protected readonly engine = "sqlite";
	protected readonly placeholder = () => "?";

	protected async connect<T>(_db: string, work: (client: SqliteClient) => Promise<T>) {
		return work(await connector("sqlite").client());
	}

	protected rows<T>(client: SqliteClient, sql: string, values: unknown[] = []) {
		return all<T>(client, sql, values);
	}

	protected async execute(client: SqliteClient, sql: string, values: unknown[] = []) {
		return (await client.execute(stmt(sql, values))).rowsAffected;
	}

	protected override prepareQuery(query: string) {
		const statement = super.prepareQuery(query);

		if (isTransactionControl(statement))
			throw new HTTPException(400, {
				message:
					"Transaction statements (BEGIN, COMMIT, ROLLBACK, SAVEPOINT, RELEASE) are not supported in the query runner: each query runs on its own connection, so a transaction cannot span queries.",
			});

		if (hasMultipleStatements(statement))
			throw new HTTPException(400, { message: ONE_STATEMENT_MESSAGE });

		return statement;
	}

	protected async runStatement(client: SqliteClient, statement: string) {
		const result = await client.execute(statement);

		// Statements that return rows report their columns even when no row matches.
		return result.columns.length > 0
			? { columns: result.columns, rows: toRows(result) }
			: { affected: result.rowsAffected };
	}

	protected isFkViolation(e: unknown) {
		return e instanceof Error && e.message.includes("FOREIGN KEY constraint failed");
	}

	override async getTableData(params: GetTableDataParams) {
		const {
			tableName,
			limit = 50,
			direction = "asc",
			sort = [],
			order = "asc",
			cursor,
			filters = [],
		} = params;

		const client = await connector("sqlite").client();

		const colInfoRows = await all<TableInfoRow>(
			client,
			`PRAGMA table_info(${quoteSqliteIdent(tableName)})`,
		);

		// PRAGMA table_info returns no rows instead of failing for a dropped table or stale URL.
		if (colInfoRows.length === 0)
			throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		const pkColumns: string[] = colInfoRows
			.filter((c) => c.pk > 0)
			.sort((a, b) => a.pk - b.pk)
			.map((c) => c.name);

		// A table without a key pages by rowid when unsorted. A view has no rowid, so a sorted
		// table without a key gets no tie-breaker.
		const useRowid = pkColumns.length === 0 && sort.length === 0;
		const terms = orderTerms(sort, order, useRowid ? ["rowid"] : pkColumns);
		const backward = direction === "desc";

		const { values, bind } = createBinds(() => "?");
		const filterConditions = buildFilterConditions(filters, bind, sqliteFilters);

		const [countRow] = await all<{ total: number }>(
			client,
			`SELECT COUNT(*) as total FROM ${quoteSqliteIdent(tableName)} ${whereSql(filterConditions)}`,
			[...values],
		);

		const cursorValues = cursor ? decodeCursor(cursor, sqlCursorSchema)?.values : undefined;

		const where = whereSql(
			cursorValues
				? [
						...filterConditions,
						keysetPredicate(terms, cursorValues, backward, bind, sqliteKeyset),
					]
				: filterConditions,
		);

		const fetched = await all(
			client,
			`SELECT ${useRowid ? "*, rowid" : "*"} FROM ${quoteSqliteIdent(tableName)} ${where} ${keysetOrderBy(terms, backward, sqliteKeyset)} LIMIT ${bind(limit + 1)}`,
			values,
		);

		const { rows, ...page } = keysetPage(fetched, { limit, cursor, backward, terms });

		return {
			data: (useRowid ? rows.map(({ rowid: _r, ...rest }) => rest) : rows) as NormalizedRow[],
			meta: { limit, total: Number(countRow?.total ?? 0), ...page },
		};
	}

	async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const { name, size } = await (await connector("sqlite").client()).info();

		return [{ name, size, owner: "", encoding: "UTF-8" }];
	}

	async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return { db: (await (await connector("sqlite").client()).info()).name };
	}

	async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		const { name, version } = await (await connector("sqlite").client()).info();

		return {
			host: null,
			port: null,
			user: "",
			database: name,
			version,
			active_connections: 1,
			max_connections: 1,
		};
	}

	/** SQLite keeps no row estimates, so every table is counted. */
	protected tableEstimates(client: SqliteClient) {
		return all<TableEstimate>(
			client,
			`SELECT name AS tableName FROM sqlite_master
				WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*'
				ORDER BY name`,
		);
	}

	/** One round trip for every count; matters against a remote server. */
	protected override async exactCounts(client: SqliteClient, tables: TableEstimate[]) {
		const counts = await client.batch(
			tables.map((t) => `SELECT COUNT(*) as count FROM ${quoteSqliteIdent(t.tableName)}`),
			"read",
		);

		return counts.map((result) => Number(toRows<{ count: number }>(result)[0]?.count ?? 0));
	}

	async createTable({
		tableData,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		const { tableName, fields, foreignKeys } = tableData;

		const primaryKey = fields.filter((f) => f.isPrimaryKey).map((f) => f.columnName);

		const columnDefs = fields.map((field: FieldDataType) => {
			// SQLite AUTOINCREMENT requires "INTEGER PRIMARY KEY AUTOINCREMENT"
			if (primaryKey.length === 1 && field.isPrimaryKey && field.isIdentity) {
				return `${quoteSqliteIdent(field.columnName)} INTEGER PRIMARY KEY AUTOINCREMENT`;
			}

			let def = `${quoteSqliteIdent(field.columnName)} ${field.columnType}`;

			if (primaryKey.length === 1 && field.isPrimaryKey) def += " PRIMARY KEY";

			if (field.isUnique && !field.isPrimaryKey) def += " UNIQUE";

			if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

			if (field.defaultValue?.trim() && !field.isIdentity)
				def += ` DEFAULT ${field.defaultValue.trim()}`;

			return def;
		});

		if (primaryKey.length > 1)
			columnDefs.push(`PRIMARY KEY (${primaryKey.map(quoteSqliteIdent).join(", ")})`);

		const fkDefs =
			foreignKeys?.map(
				(fk: ForeignKeyDataType) =>
					`FOREIGN KEY (${quoteSqliteIdent(fk.columnName)}) REFERENCES ${quoteSqliteIdent(fk.referencedTable)} (${quoteSqliteIdent(fk.referencedColumn)}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`,
			) ?? [];

		const client = await connector("sqlite").client();
		await client.execute(
			`CREATE TABLE ${quoteSqliteIdent(tableName)} (${[...columnDefs, ...fkDefs].join(", ")})`,
		);
	}

	/** SQLite matches table names without case. */
	protected override async otherTablesReferencing(client: SqliteClient, tableName: string) {
		return (await this.referencingKeys(client, tableName)).filter(
			(fk) => fk.table.toLowerCase() !== tableName.toLowerCase(),
		);
	}

	async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		const { tableName, newTableName } = params;
		this.assertDifferentTableName(tableName, newTableName);
		const client = await connector("sqlite").client();

		await this.requireTable(client, tableName);

		if (await this.columnNames(client, newTableName))
			throw new HTTPException(409, {
				message: `Table "${newTableName}" already exists`,
			});

		await client.execute(
			`ALTER TABLE ${quoteSqliteIdent(tableName)} RENAME TO ${quoteSqliteIdent(newTableName)}`,
		);
	}

	async getTableSchema({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const [row] = await all<{ sql: string }>(
			await connector("sqlite").client(),
			`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
			[tableName],
		);

		if (!row) throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });

		return row.sql;
	}

	async getTableColumns({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const client = await connector("sqlite").client();

		await this.requireTable(client, tableName);

		const columns = await all<TableInfoRow>(
			client,
			`PRAGMA table_info(${quoteSqliteIdent(tableName)})`,
		);

		const fks = await all<FkRow>(
			client,
			`PRAGMA foreign_key_list(${quoteSqliteIdent(tableName)})`,
		);

		const fkMap = new Map<string, FkRow>();

		for (const fk of fks) {
			fkMap.set(fk.from, fk);
		}

		return columns.map((col) => {
			const fk = fkMap.get(col.name);
			const nativeType = col.type.toLowerCase();

			return {
				columnName: col.name,
				dataType: mapSqliteToDataType(nativeType),
				dataTypeLabel: standardizeSqliteDataTypeLabel(nativeType),
				isNullable: col.notnull === 0 && col.pk === 0,
				columnDefault: col.dflt_value,
				isPrimaryKey: col.pk > 0,
				isForeignKey: fkMap.has(col.name),
				referencedTable: fk?.table ?? null,
				referencedColumn: fk?.to ?? null,
				enumValues: null,
			};
		});
	}

	async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, columnType, defaultValue, isNullable, isUnique } = params;

			const client = await connector("sqlite").client();

			this.assertColumnAbsent(
				await this.requireTable(client, tableName),
				tableName,
				columnName,
			);

			let def = `${quoteSqliteIdent(columnName)} ${columnType}`;

			if (isUnique) def += " UNIQUE";

			if (!isNullable) def += " NOT NULL";

			if (defaultValue?.trim()) def += ` DEFAULT ${defaultValue.trim()}`;

			await client.execute(`ALTER TABLE ${quoteSqliteIdent(tableName)} ADD COLUMN ${def}`);
		});
	}

	async deleteColumn(params: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName } = params;
			const client = await connector("sqlite").client();

			await this.requireColumn(client, tableName, columnName);

			await client.execute(
				`ALTER TABLE ${quoteSqliteIdent(tableName)} DROP COLUMN ${quoteSqliteIdent(columnName)}`,
			);

			return { deletedCount: 1 };
		});
	}

	async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, columnType, isNullable, defaultValue } = params;
			const client = await connector("sqlite").client();

			await this.requireColumn(client, tableName, columnName);

			const colInfo = await all<TableInfoRow>(
				client,
				`PRAGMA table_info(${quoteSqliteIdent(tableName)})`,
			);

			const target = colInfo.find((c) => c.name === columnName);

			// SQLite has no ALTER COLUMN, so the table is recreated from its own CREATE TABLE.
			// Rebuilding it from PRAGMA output instead would drop UNIQUE, CHECK, COLLATE,
			// AUTOINCREMENT and generated columns, which the PRAGMAs do not report.
			const tempName = `${tableName}_alter_${Date.now()}`;

			const [table] = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
				[tableName],
			);

			const createTemp = recreateTableWithColumn(table?.sql ?? "", tempName, columnName, {
				type: columnType,
				notNull: !isNullable && !target?.pk,
				defaultValue: defaultValue?.trim() || null,
			});

			if (!createTemp) {
				throw new HTTPException(400, {
					message: `Cannot edit columns of "${tableName}": its definition could not be read`,
				});
			}

			// Generated columns are absent from table_info and are computed again on insert.
			const colNames = colInfo.map((c) => quoteSqliteIdent(c.name)).join(", ");
			// Copying rows sets the AUTOINCREMENT counter to the highest id copied; carry the old
			// one over so ids of rows deleted earlier are never handed out again.
			const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

			const keepSequence = /\bAUTOINCREMENT\b/i.test(createTemp)
				? [
						`DELETE FROM sqlite_sequence WHERE name = ${literal(tempName)}`,
						`INSERT INTO sqlite_sequence (name, seq) SELECT ${literal(tempName)}, seq FROM sqlite_sequence WHERE name = ${literal(tableName)}`,
					]
				: [];

			const existingIndexes = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL`,
				[tableName],
			);

			const existingTriggers = await all<{ sql: string }>(
				client,
				`SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?`,
				[tableName],
			);

			// DROP TABLE runs an implicit DELETE, which fires the foreign key actions of every
			// table that references this one, including itself: the new table's self-references
			// point at the old name until the RENAME.
			const referencedBy = new Set(
				(await this.referencingKeys(client, tableName)).map((fk) => fk.table),
			);

			await client.rebuildTable(
				[
					createTemp,
					`INSERT INTO ${quoteSqliteIdent(tempName)} (${colNames}) SELECT ${colNames} FROM ${quoteSqliteIdent(tableName)}`,
					...keepSequence,
					`DROP TABLE ${quoteSqliteIdent(tableName)}`,
					`ALTER TABLE ${quoteSqliteIdent(tempName)} RENAME TO ${quoteSqliteIdent(tableName)}`,
					...existingIndexes.map(({ sql }) => sql),
					...existingTriggers.map(({ sql }) => sql),
				],
				[...referencedBy],
			);
		});
	}

	async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(async () => {
			const { tableName, columnName, newColumnName } = params;
			const client = await connector("sqlite").client();

			this.assertColumnAbsent(
				await this.requireColumn(client, tableName, columnName),
				tableName,
				newColumnName,
			);

			await client.execute(
				`ALTER TABLE ${quoteSqliteIdent(tableName)} RENAME COLUMN ${quoteSqliteIdent(columnName)} TO ${quoteSqliteIdent(newColumnName)}`,
			);
		});
	}

	async addRecord({
		params,
	}: {
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		const { tableName, data } = params;
		const columns = Object.keys(data);

		if (!columns.length)
			throw new HTTPException(400, { message: "No data provided for insert" });

		const colNames = columns.map(quoteSqliteIdent).join(", ");
		const placeholders = columns.map(() => "?").join(", ");

		const client = await connector("sqlite").client();

		const result = await client.execute(
			stmt(
				`INSERT INTO ${quoteSqliteIdent(tableName)} (${colNames}) VALUES (${placeholders})`,
				Object.values(data),
			),
		);

		if (result.rowsAffected === 0)
			throw new HTTPException(500, {
				message: `Failed to insert record into "${tableName}"`,
			});

		return { insertedCount: result.rowsAffected };
	}

	async updateRecords({
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;

		const keyColumns = this.resolveKeyColumns(params);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		const where = keyColumns.map((column) => `${quoteSqliteIdent(column)} = ?`).join(" AND ");

		const client = await connector("sqlite").client();
		this.assertWholeKey(await this.primaryKey(client, tableName), keyColumns);

		// A batch is one transaction, and the guard after each UPDATE fails it with an integer
		// overflow when that UPDATE matched no row, rolling back every earlier UPDATE. RAISE()
		// would name the row but only works inside a trigger.
		const statements = groups.flatMap(({ keyValues, rowUpdates }) => [
			stmt(
				`UPDATE ${quoteSqliteIdent(tableName)} SET ${rowUpdates.map((u) => `${quoteSqliteIdent(u.columnName)} = ?`).join(", ")} WHERE ${where}`,
				[...rowUpdates.map((u) => u.value), ...keyValues],
			),
			"SELECT CASE WHEN changes() = 0 THEN abs(-9223372036854775808) END",
		]);

		try {
			const results = await client.batch(statements, "write");

			return {
				updatedCount: results.reduce(
					(total, result, i) => (i % 2 === 0 ? total + result.rowsAffected : total),
					0,
				),
			};
		} catch (e) {
			if (!(e instanceof Error && e.message.includes("integer overflow"))) throw e;

			const found = await client.batch(
				groups.map(({ keyValues }) =>
					stmt(
						`SELECT 1 FROM ${quoteSqliteIdent(tableName)} WHERE ${where} LIMIT 1`,
						keyValues,
					),
				),
				"read",
			);

			const missing = groups.find((_, i) => found[i].rows.length === 0);

			if (!missing) throw e;
			throw new HTTPException(404, {
				message: `Record with ${this.describeKey(keyColumns, missing.keyValues)} not found in table "${tableName}"`,
			});
		}
	}

	/**
	 * Deletes the rows and, children first, every row that references them through any chain
	 * of foreign keys. Each table's rows are selected by a predicate nested on its parent's,
	 * so the plan is a list of plain DELETEs that run as one write batch (one transaction).
	 * A foreign key cycle is not followed; rows it still references make the batch fail
	 * and roll back instead of leaving orphans.
	 */
	async forceDeleteRecords({
		tableName,
		primaryKeys,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const pkColumn = primaryKeys[0].columnName;
		const pkValues = primaryKeys.map((pk) => pk.value);
		const rootPredicate = `${quoteSqliteIdent(pkColumn)} IN (${pkValues.map(() => "?").join(", ")})`;

		try {
			const client = await connector("sqlite").client();
			this.assertDeletableKey(await this.primaryKey(client, tableName));
			const fksByParent = await this.foreignKeysByParent(client);
			const deletes: SqlStatement[] = [];

			const plan = async (table: string, predicate: string, path: string[]) => {
				for (const fk of fksByParent.get(table.toLowerCase()) ?? []) {
					if (path.includes(fk.table)) continue;

					const childPredicate = `(${fk.columns.map(quoteSqliteIdent).join(", ")}) IN (SELECT ${fk.referencedColumns.map(quoteSqliteIdent).join(", ")} FROM ${quoteSqliteIdent(table)} WHERE ${predicate})`;
					await plan(fk.table, childPredicate, [...path, fk.table]);
				}

				deletes.push(
					stmt(`DELETE FROM ${quoteSqliteIdent(table)} WHERE ${predicate}`, pkValues),
				);
			};

			await plan(tableName, rootPredicate, [tableName]);

			const results = await client.batch(deletes, "write");

			return { deletedCount: results.reduce((sum, r) => sum + r.rowsAffected, 0) };
		} catch (e) {
			if (this.isFkViolation(e))
				throw new HTTPException(409, {
					message: `Cannot force delete from "${tableName}": rows are still referenced through a foreign key cycle`,
				});
			throw e;
		}
	}

	async bulkInsertRecords({
		tableName,
		records,
	}: BulkInsertRecordsParams): Promise<BulkInsertResult> {
		const columns = Object.keys(records[0]);
		const colNames = columns.map(quoteSqliteIdent).join(", ");
		const placeholders = columns.map(() => "?").join(", ");
		const sql = `INSERT INTO ${quoteSqliteIdent(tableName)} (${colNames}) VALUES (${placeholders})`;

		const client = await connector("sqlite").client();
		await client.batch(
			records.map((record) =>
				stmt(
					sql,
					columns.map((col) => record[col]),
				),
			),
			"write",
		);

		return {
			success: true,
			message: `Bulk insert completed: ${records.length} records inserted`,
			successCount: records.length,
			failureCount: 0,
		};
	}

	protected async columnNames(client: SqliteClient, tableName: string) {
		const rows = await all<{ name: string }>(
			client,
			"SELECT c.name FROM sqlite_master m JOIN pragma_table_info(m.name) c WHERE m.type = 'table' AND m.name = ? ORDER BY c.cid",
			[tableName],
		);

		return rows.length ? rows.map((row) => row.name) : undefined;
	}

	// Serialized with column changes: alterColumn rebuilds the table from the indexes it read.
	override createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(() => super.createIndex(params));
	}

	override dropIndex(params: DropIndexParamsSchemaType): Promise<void> {
		return this.serializeSchemaChange(() => super.dropIndex(params));
	}

	protected override indexError(e: Error) {
		// Indexes share one namespace with tables, so either can already hold the name.
		if (/already exists|there is already|UNIQUE constraint failed/.test(e.message))
			return { status: 409 };

		if (e.message.includes("reserved for internal use")) return { status: 400 };

		return undefined;
	}

	protected async listIndexes(
		client: SqliteClient,
		tableName: string,
	): Promise<IndexInfoSchemaType[]> {
		await this.requireTable(client, tableName);

		// A rowid table's INTEGER PRIMARY KEY is the rowid itself, so it has no index to list.
		const rows = await all<IndexKeyRow>(
			client,
			`SELECT il.name AS indexName, il."unique" AS isUnique, il.origin, il.partial, m.sql,
				xi.seqno, xi.cid, xi.name AS columnName
			 FROM pragma_index_list(?) il
			 JOIN pragma_index_xinfo(il.name) xi ON xi.key = 1
			 LEFT JOIN sqlite_master m ON m.type = 'index' AND m.name = il.name
			 ORDER BY il.origin = 'pk' DESC, il.name, xi.seqno`,
			[tableName],
		);

		const byName = new Map<string, IndexInfoSchemaType>();

		for (const row of rows) {
			const index = byName.get(row.indexName) ?? {
				indexName: row.indexName,
				columns: [],
				isUnique: row.isUnique === 1,
				method: null,
				kind:
					row.origin === "pk" ? "primary" : row.origin === "u" ? "unique-constraint" : "index",
				definition: row.partial === 1 ? row.sql : null,
			};

			byName.set(row.indexName, index);

			if (row.columnName !== null) {
				index.columns.push(row.columnName);
			} else {
				index.columns.push(indexKeyParts(row.sql ?? "")[row.seqno] ?? "");
				index.definition = row.sql;
			}
		}

		return [...byName.values()];
	}

	protected async primaryKey(client: SqliteClient, tableName: string) {
		const cols = await all<TableInfoRow>(
			client,
			`PRAGMA table_info(${quoteSqliteIdent(tableName)})`,
		);

		return cols
			.filter((c) => c.pk > 0)
			.sort((a, b) => a.pk - b.pk)
			.map((c) => c.name);
	}

	/**
	 * Every foreign key in the database, keyed by the lowercased name of the table it
	 * references: SQLite matches the names without case. A key that names no columns
	 * references the parent's primary key.
	 */
	private async foreignKeysByParent(
		client: SqliteClient,
	): Promise<Map<string, ReferencingKey[]>> {
		const rows = await all<{
			child: string;
			id: number;
			parent: string;
			from: string;
			to: string | null;
		}>(
			client,
			`SELECT m.name AS child, f.id, f."table" AS parent, f."from", f."to"
			FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
			WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT GLOB '_cf_*'
			ORDER BY m.name, f.id, f.seq`,
		);

		const constraints = new Map<
			string,
			{ parent: string; fk: ReferencingKey; to: (string | null)[] }
		>();

		for (const row of rows) {
			const key = `${row.child}\u0000${row.id}`;

			const entry = constraints.get(key) ?? {
				parent: row.parent,
				fk: { constraintName: "", table: row.child, columns: [], referencedColumns: [] },
				to: [],
			};

			entry.fk.columns.push(row.from);
			entry.to.push(row.to);
			constraints.set(key, entry);
		}

		const byParent = new Map<string, ReferencingKey[]>();

		for (const { parent, fk, to } of constraints.values()) {
			fk.referencedColumns = to.every((column) => column !== null)
				? to
				: await this.primaryKey(client, parent);
			fk.constraintName = `fk_${fk.table}_${fk.columns.join("_")}_${parent}_${fk.referencedColumns.join("_")}`;
			const id = parent.toLowerCase();
			byParent.set(id, [...(byParent.get(id) ?? []), fk]);
		}

		return byParent;
	}

	protected async referencingKeys(client: SqliteClient, tableName: string) {
		return (await this.foreignKeysByParent(client)).get(tableName.toLowerCase()) ?? [];
	}
}
