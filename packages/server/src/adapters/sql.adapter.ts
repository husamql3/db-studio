import {
	type ColumnInfoSchemaType,
	type CreateIndexParamsSchemaType,
	DATABASE_ENGINES,
	type DatabaseSchemaType,
	type DeleteRecordParams,
	type DeleteRecordResult,
	type DeleteTableParams,
	type DeleteTableResult,
	type DropIndexParamsSchemaType,
	type ExecuteQueryResult,
	type IndexInfoSchemaType,
	type RelatedRecord,
	type TableInfoSchemaType,
	type UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import {
	BaseAdapter,
	type DriverErrorClass,
	EXACT_COUNT_LIMIT,
	notImplemented,
} from "@/adapters/base.adapter.js";
import { createBinds } from "@/adapters/sql-filters.js";
import { HTTPException } from "@/http-exception.js";

type Bind = (value: unknown) => string;

/** How an update writes a value into `column`: the SQL for it, binding through `bind`. */
export type BindValue = (column: string, value: unknown, bind: Bind) => string;

/**
 * The key of a table and how its values bind, from its columns, for a driver that takes
 * neither objects nor the grid's "true"/"false" for a boolean column: JSON as text, and the
 * boolean as 1 or 0.
 */
export const flagOrJsonTarget = (columns: ColumnInfoSchemaType[]) => {
	const booleans = new Set(
		columns.flatMap((c) => (c.dataTypeLabel === "boolean" ? [c.columnName] : [])),
	);

	const bindValue: BindValue = (column, value, bind) => {
		if (value !== null && typeof value === "object") return bind(JSON.stringify(value));

		if (booleans.has(column) && typeof value === "string")
			return bind(value === "true" ? 1 : 0);

		return bind(value);
	};

	return {
		primaryKey: columns.flatMap((c) => (c.isPrimaryKey ? [c.columnName] : [])),
		bindValue,
	};
};

/** A foreign key that references a table. Composite keys keep their columns in order. */
export interface ReferencingKey {
	constraintName: string;
	/** The referencing table, with its schema on an engine that has several. */
	table: string;
	schema?: string;
	columns: string[];
	referencedColumns: string[];
}

/** Rows shown per foreign key when a delete is refused. */
export const RELATED_SAMPLE = 100;

type KeyColumnRow = Omit<ReferencingKey, "columns" | "referencedColumns"> & {
	column: string;
	referencedColumn: string;
	referencedTable?: string;
};

/** Foreign keys from catalog rows that name one key column each, in key order. */
export const groupKeyColumns = (rows: KeyColumnRow[]) => {
	const keys = new Map<string, ReferencingKey & { referencedTable?: string }>();

	for (const { column, referencedColumn, ...key } of rows) {
		const id = JSON.stringify([key.schema, key.table, key.constraintName]);
		const fk = keys.get(id) ?? { ...key, columns: [], referencedColumns: [] };

		fk.columns.push(column);
		fk.referencedColumns.push(referencedColumn);
		keys.set(id, fk);
	}

	return [...keys.values()];
};

/** A table of the list, with the row count the engine estimates for it, if it keeps one. */
export interface TableEstimate {
	schemaName?: string;
	tableName: string;
	estimate?: number;
}

/** What one statement of the query runner gave: rows, or how many rows it changed. */
export type StatementResult =
	| { columns: string[]; rows: Record<string, unknown>[] }
	| { affected: number | undefined };

/** An index as an engine lists it; PostgreSQL adds the schema it lives in. */
type ListedIndex = IndexInfoSchemaType & { schemaName?: string };

/**
 * A relational engine. Each one supplies its connection, quoting and catalog hooks; the
 * operations every engine does the same way are written once here.
 */
export abstract class SqlAdapter<Conn> extends BaseAdapter {
	protected abstract readonly engine:
		| "pg"
		| "mysql"
		| "mssql"
		| "sqlite"
		| "duckdb"
		| "oracle";
	protected abstract readonly quoteIdentifier: (name: string) => string;
	/** The n-th bound value's placeholder, counting from 1. */
	protected abstract readonly placeholder: (position: number) => string;

	protected abstract connect<T>(db: string, work: (conn: Conn) => Promise<T>): Promise<T>;

	protected abstract rows<T = Record<string, unknown>>(
		conn: Conn,
		sql: string,
		values?: unknown[],
	): Promise<T[]>;

	/** Runs a statement that writes, and returns how many rows it changed. */
	protected abstract execute(conn: Conn, sql: string, values?: unknown[]): Promise<number>;

	/** Runs `work` on one connection inside a transaction, committed when it resolves. */
	protected transaction<T>(_db: string, _work: (conn: Conn) => Promise<T>): Promise<T> {
		return notImplemented("transactions");
	}

	/** The primary key columns of `tableName`, in key order. */
	protected abstract primaryKey(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<string[]>;

	/** The driver error of a delete that rows of another table still reference. */
	protected abstract isFkViolation(e: unknown): boolean;

	/**
	 * What an update of `tableName` needs: its primary key, and how a value binds into a
	 * column (where the engine converts values by the column's type).
	 */
	protected async updateTarget(
		conn: Conn,
		_db: string,
		tableName: string,
		schemaName: string | undefined,
	): Promise<{ primaryKey: string[]; bindValue: BindValue }> {
		return {
			primaryKey: await this.primaryKey(conn, tableName, schemaName),
			bindValue: (_column, value, bind) => bind(value),
		};
	}

	/** The foreign keys that reference `tableName`, its own included. */
	protected abstract referencingKeys(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<ReferencingKey[]>;

	/**
	 * Statements the table list counts its tables in, run at once. A query per table would
	 * queue behind a pool's connections and, with enough tables, wait past its connect timeout.
	 */
	protected readonly countStatements: number = 4;

	/** Every table of the list, in order, each with its row estimate where the engine keeps one. */
	protected abstract tableEstimates(conn: Conn, db: string): Promise<TableEstimate[]>;

	/** Exact row counts of `tables`, in order; undefined for a table that cannot be counted. */
	protected async exactCounts(
		conn: Conn,
		tables: TableEstimate[],
	): Promise<Array<number | undefined>> {
		const q = this.quoteIdentifier;
		const statements: string[][] = Array.from({ length: this.countStatements }, () => []);

		tables.forEach(({ tableName, schemaName }, i) => {
			statements[i % this.countStatements]?.push(
				`SELECT ${i} AS ${q("position")}, COUNT(*) AS ${q("total")} FROM ${this.tableRef(tableName, schemaName)}`,
			);
		});

		const results = await Promise.all(
			statements.flatMap((selects) =>
				selects.length
					? [
							this.rows<{ position: unknown; total: unknown }>(
								conn,
								selects.join(" UNION ALL "),
							),
						]
					: [],
			),
		);

		const counts: Array<number | undefined> = tables.map(() => undefined);

		for (const row of results.flat()) counts[Number(row.position)] = Number(row.total);

		return counts;
	}

	/**
	 * Counting a table reads all of it, so only tables estimated below EXACT_COUNT_LIMIT rows
	 * are counted; larger ones report their estimate.
	 */
	async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		return this.connect(db, async (conn) => {
			const tables = await this.tableEstimates(conn, db);

			const counted = tables.filter(
				({ estimate }) => estimate === undefined || estimate < EXACT_COUNT_LIMIT,
			);

			const exact = counted.length ? await this.exactCounts(conn, counted) : [];
			const counts = new Map(counted.map((table, i) => [table, exact[i]]));

			return tables.map((table) => {
				const { estimate, ...name } = table;
				const count = counts.get(table);

				return count === undefined
					? { ...name, rowCount: Math.round(estimate ?? 0), rowCountEstimated: true }
					: { ...name, rowCount: count };
			});
		});
	}

	/** The row estimate the engine keeps for one table, where it keeps one. */
	protected async tableEstimate(
		_conn: Conn,
		_db: string,
		_tableName: string,
	): Promise<number | undefined> {
		return undefined;
	}

	/**
	 * Rows matching the filters. Unfiltered, a table estimated at EXACT_COUNT_LIMIT rows or more
	 * reports that estimate, because an exact count reads the whole table and the total is
	 * fetched with every page.
	 */
	protected async pageTotal(
		conn: Conn,
		db: string,
		tableName: string,
		schemaName: string | undefined,
		filterWhere: string,
		filterValues: unknown[],
	): Promise<{ total: number; estimated: boolean }> {
		if (!filterWhere) {
			const estimate = await this.tableEstimate(conn, db, tableName);

			if (estimate !== undefined && estimate >= EXACT_COUNT_LIMIT)
				return { total: estimate, estimated: true };
		}

		const [row] = await this.rows<{ total: unknown }>(
			conn,
			`SELECT COUNT(*) AS ${this.quoteIdentifier("total")} FROM ${this.tableRef(tableName, schemaName)} ${filterWhere}`,
			filterValues,
		);

		return { total: Number(row?.total ?? 0), estimated: false };
	}

	/** The rows a table drop deletes, counted before it. */
	protected async rowCount(conn: Conn, tableName: string, schemaName?: string) {
		const [row] = await this.rows<{ total: unknown }>(
			conn,
			`SELECT COUNT(*) AS ${this.quoteIdentifier("total")} FROM ${this.tableRef(tableName, schemaName)}`,
		);

		return Number(row?.total ?? 0);
	}

	/** The foreign keys of other tables that reference `tableName`: its own go with it. */
	protected async otherTablesReferencing(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<ReferencingKey[]> {
		return (await this.referencingKeys(conn, tableName, schemaName)).filter(
			(fk) => fk.table !== tableName,
		);
	}

	/**
	 * Drops the table. `referencing` holds the foreign keys of other tables that reference it,
	 * left only when `cascade` is set.
	 */
	protected async dropTable(
		conn: Conn,
		{ tableName, schemaName }: DeleteTableParams,
		_referencing: ReferencingKey[],
	): Promise<void> {
		await this.execute(conn, `DROP TABLE ${this.tableRef(tableName, schemaName)}`);
	}

	/** The driver error of a DROP TABLE that another object still depends on. */
	protected isDropRefused(e: unknown): boolean {
		return this.isFkViolation(e);
	}

	/**
	 * Drops the table and reports the rows it held. Without `cascade`, a table other tables
	 * reference is kept, and the referencing rows are returned instead.
	 */
	async deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
		const { tableName, schemaName, db, cascade } = params;

		return this.connect(db, async (conn) => {
			await this.requireTable(conn, tableName, schemaName);
			const deletedCount = await this.rowCount(conn, tableName, schemaName);
			const referencing = await this.otherTablesReferencing(conn, tableName, schemaName);

			const refused = async () => ({
				deletedCount: 0,
				fkViolation: true,
				relatedRecords: await this.rowsReferencingTable(conn, referencing),
			});

			if (!cascade && referencing.length) return refused();

			try {
				await this.dropTable(conn, params, referencing);
			} catch (e) {
				if (!this.isDropRefused(e)) throw e;

				return refused();
			}

			return { deletedCount, fkViolation: false, relatedRecords: [] };
		});
	}

	/** The query runner's statement: trimmed, without trailing semicolons. */
	protected prepareQuery(query: string): string {
		return query.trim().replace(/;+$/, "");
	}

	protected abstract runStatement(conn: Conn, statement: string): Promise<StatementResult>;

	/** Runs one statement of the query runner, with autocommit. */
	async executeQuery({
		query,
		db,
	}: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		const statement = this.prepareQuery(query);

		return this.connect(db, async (conn) => {
			const start = performance.now();
			const result = await this.runStatement(conn, statement);
			const duration = performance.now() - start;

			if ("rows" in result)
				return {
					...result,
					rowCount: result.rows.length,
					duration,
					message: result.rows.length === 0 ? "OK" : undefined,
				};

			return {
				columns: [],
				rows: [],
				rowCount: result.affected ?? 0,
				duration,
				message:
					result.affected === undefined ? "OK" : `OK (${result.affected} rows affected)`,
			};
		});
	}

	/** The column names of `tableName`, in order, or undefined when there is no such table. */
	protected abstract columnNames(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<string[] | undefined>;

	protected tableMissing(tableName: string) {
		return new HTTPException(404, { message: `Table "${tableName}" does not exist` });
	}

	/** The column names of `tableName`; 404 when there is no such table. */
	protected async requireTable(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<string[]> {
		const columns = await this.columnNames(conn, tableName, schemaName);

		if (!columns) throw this.tableMissing(tableName);

		return columns;
	}

	/** The column names of `tableName`; 404 when the table or `columnName` is missing. */
	protected async requireColumn(
		conn: Conn,
		tableName: string,
		columnName: string,
		schemaName?: string,
	): Promise<string[]> {
		const columns = await this.requireTable(conn, tableName, schemaName);

		if (!columns.includes(columnName))
			throw new HTTPException(404, {
				message: `Column "${columnName}" does not exist in table "${tableName}"`,
			});

		return columns;
	}

	/** 409 when `columns` of `tableName` already hold `columnName`. */
	protected assertColumnAbsent(columns: string[], tableName: string, columnName: string) {
		if (columns.includes(columnName))
			throw new HTTPException(409, {
				message: `Column "${columnName}" already exists in table "${tableName}"`,
			});
	}

	/** The indexes of `tableName`, its primary key first; 404 when there is no such table. */
	protected abstract listIndexes(
		conn: Conn,
		tableName: string,
		schemaName?: string,
	): Promise<ListedIndex[]>;

	protected createIndexSql({
		tableName,
		schemaName,
		indexName,
		columns,
		isUnique,
	}: CreateIndexParamsSchemaType): string {
		const q = this.quoteIdentifier;

		return `CREATE ${isUnique ? "UNIQUE " : ""}INDEX ${q(indexName)} ON ${this.tableRef(tableName, schemaName)} (${columns.map(q).join(", ")})`;
	}

	protected dropIndexSql(index: ListedIndex, _tableName: string): string {
		return `DROP INDEX ${this.quoteIdentifier(index.indexName)}`;
	}

	/** The answer to a driver error of CREATE or DROP INDEX: a name taken, a column that cannot be indexed. */
	protected indexError(_e: Error): DriverErrorClass | undefined {
		return undefined;
	}

	async getTableIndexes({
		tableName,
		schemaName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		const indexes = await this.connect(db, (conn) =>
			this.listIndexes(conn, tableName, schemaName),
		);

		return indexes.map(({ schemaName: _schemaName, ...index }) => index);
	}

	async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		const { tableName, schemaName, columns, method, db } = params;
		const { indexes } = DATABASE_ENGINES[this.engine];

		await this.connect(db, async (conn) => {
			const existing = await this.requireTable(conn, tableName, schemaName);
			const missing = columns.find((column) => !existing.includes(column));

			if (missing !== undefined)
				throw new HTTPException(400, {
					message: `Column "${missing}" does not exist in table "${tableName}"`,
				});

			if (method !== undefined && !indexes.methods.some((offered) => offered === method))
				throw new HTTPException(400, { message: `Unsupported index method "${method}"` });

			await this.runIndexDdl(conn, this.createIndexSql(params));
		});
	}

	async dropIndex({
		tableName,
		schemaName,
		indexName,
		db,
	}: DropIndexParamsSchemaType): Promise<void> {
		await this.connect(db, async (conn) => {
			const index = (await this.listIndexes(conn, tableName, schemaName)).find(
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

			await this.runIndexDdl(conn, this.dropIndexSql(index, tableName));
		});
	}

	private async runIndexDdl(conn: Conn, sql: string) {
		try {
			await this.execute(conn, sql);
		} catch (e) {
			const answer = e instanceof Error ? this.indexError(e) : undefined;

			if (!answer || !(e instanceof Error)) throw e;
			throw new HTTPException(answer.status, {
				message: answer.message ?? e.message,
				cause: e,
			});
		}
	}

	/** `tableName` as SQL: quoted, and schema-qualified on an engine that has schemas. */
	protected tableRef(tableName: string, _schemaName?: string): string {
		return this.quoteIdentifier(tableName);
	}

	/** Up to RELATED_SAMPLE rows of a table, aliased `c`, after `rest`: its joins and WHERE. */
	protected sampleRows(
		conn: Conn,
		fk: ReferencingKey,
		rest: string,
		values: unknown[],
	): Promise<Record<string, unknown>[]> {
		return this.rows(
			conn,
			`SELECT c.* FROM ${this.tableRef(fk.table, fk.schema)} c ${rest} LIMIT ${RELATED_SAMPLE}`,
			values,
		);
	}

	/** The rows of each referencing table that hold a reference, for a refused table drop. */
	protected rowsReferencingTable(
		conn: Conn,
		keys: ReferencingKey[],
	): Promise<RelatedRecord[]> {
		const q = this.quoteIdentifier;

		return this.relatedRecords(keys, (fk) =>
			this.sampleRows(
				conn,
				fk,
				`WHERE ${fk.columns.map((column) => `c.${q(column)} IS NOT NULL`).join(" AND ")}`,
				[],
			),
		);
	}

	/**
	 * The rows that reference the rows of `tableName` matching `parentWhere`, a condition on
	 * the referenced table aliased `p` whose bound `values` it carries.
	 */
	protected async rowsReferencingRows(
		conn: Conn,
		tableName: string,
		schemaName: string | undefined,
		parentWhere: string,
		values: unknown[],
	): Promise<RelatedRecord[]> {
		const q = this.quoteIdentifier;

		return this.relatedRecords(await this.referencingKeys(conn, tableName, schemaName), (fk) =>
			this.sampleRows(
				conn,
				fk,
				`JOIN ${this.tableRef(tableName, schemaName)} p ON ${fk.columns
					.map((column, i) => `c.${q(column)} = p.${q(fk.referencedColumns[i])}`)
					.join(" AND ")} WHERE ${parentWhere}`,
				values,
			),
		);
	}

	private async relatedRecords(
		keys: ReferencingKey[],
		sample: (fk: ReferencingKey) => Promise<Record<string, unknown>[]>,
	): Promise<RelatedRecord[]> {
		const related: RelatedRecord[] = [];

		for (const fk of keys) {
			const records = await sample(fk);

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

	/** One UPDATE per record, matched on every key column, in one transaction. */
	async updateRecords({
		db,
		schemaName,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		schemaName?: string;
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		const q = this.quoteIdentifier;
		const keyColumns = this.resolveKeyColumns(params);
		const groups = this.groupUpdatesByKey(params, keyColumns);

		const updatedCount = await this.transaction(db, async (conn) => {
			const { primaryKey, bindValue } = await this.updateTarget(
				conn,
				db,
				tableName,
				schemaName,
			);

			this.assertWholeKey(primaryKey, keyColumns);
			let total = 0;

			for (const { keyValues, rowUpdates } of groups) {
				const { values, bind } = createBinds(this.placeholder);

				const set = rowUpdates.map(
					(u) =>
						`${q(u.columnName)} = ${u.useDefault ? "DEFAULT" : bindValue(u.columnName, u.value, bind)}`,
				);

				const where = keyColumns.map(
					(column, i) => `${q(column)} = ${bindValue(column, keyValues[i], bind)}`,
				);

				const changed = await this.execute(
					conn,
					`UPDATE ${this.tableRef(tableName, schemaName)} SET ${set.join(", ")} WHERE ${where.join(" AND ")}`,
					values,
				);

				if (changed === 0)
					throw new HTTPException(404, {
						message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in table "${tableName}"`,
					});
				total += changed;
			}

			return total;
		});

		return { updatedCount };
	}

	/** One DELETE; rows another table still references refuse it with those rows. */
	async deleteRecords({
		tableName,
		schemaName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<DeleteRecordResult> {
		const column = this.quoteIdentifier(primaryKeys[0].columnName);

		return this.connect(db, async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName, schemaName));
			const { values, bind } = createBinds(this.placeholder);
			const list = primaryKeys.map((pk) => bind(pk.value)).join(", ");

			try {
				const deletedCount = await this.execute(
					conn,
					`DELETE FROM ${this.tableRef(tableName, schemaName)} WHERE ${column} IN (${list})`,
					values,
				);

				return { deletedCount, fkViolation: false, relatedRecords: [] };
			} catch (e) {
				if (!this.isFkViolation(e)) throw e;

				return {
					deletedCount: 0,
					fkViolation: true,
					relatedRecords: await this.rowsReferencingRows(
						conn,
						tableName,
						schemaName,
						`p.${column} IN (${list})`,
						values,
					),
				};
			}
		});
	}

	/**
	 * Deletes the rows and, children first, every row that references them through any
	 * chain of foreign keys, in one transaction. Foreign key checks stay on: a dependent row
	 * this walk misses, as in a cycle of rows, fails the delete and rolls it back.
	 */
	async forceDeleteRecords({
		tableName,
		schemaName,
		primaryKeys,
		db,
	}: DeleteRecordParams): Promise<{ deletedCount: number }> {
		const q = this.quoteIdentifier;

		return this.transaction(db, async (conn) => {
			this.assertDeletableKey(await this.primaryKey(conn, tableName, schemaName));
			// Keys already handled per table and columns: a table reached again by another
			// path still deletes its new rows, and a cycle ends once no key is new.
			const handled = new Map<string, Set<string>>();

			const purge = async (
				table: string,
				schema: string | undefined,
				columns: string[],
				reached: unknown[][],
			): Promise<number> => {
				const id = JSON.stringify([schema, table, columns]);
				const seen = handled.get(id) ?? new Set<string>();
				handled.set(id, seen);
				const keyOf = (key: unknown[]) => JSON.stringify(key.map(String));
				const keys = reached.filter((key) => !seen.has(keyOf(key)));

				if (!keys.length) return 0;

				for (const key of keys) seen.add(keyOf(key));
				const ref = this.tableRef(table, schema);

				const matching = (bind: Bind) =>
					columns.length === 1
						? `${q(columns[0])} IN (${keys.map((key) => bind(key[0])).join(", ")})`
						: `(${keys.map((key) => `(${columns.map((c, i) => `${q(c)} = ${bind(key[i])}`).join(" AND ")})`).join(" OR ")})`;

				let deleted = 0;

				for (const fk of await this.referencingKeys(conn, table, schema)) {
					const { values, bind } = createBinds(this.placeholder);

					const referenced = await this.rows<Record<string, unknown>>(
						conn,
						`SELECT ${fk.referencedColumns.map(q).join(", ")} FROM ${ref} WHERE ${matching(bind)}`,
						values,
					);

					deleted += await purge(
						fk.table,
						fk.schema,
						fk.columns,
						referenced.map((row) => fk.referencedColumns.map((c) => row[c])),
					);
				}

				const { values, bind } = createBinds(this.placeholder);

				return (
					deleted +
					(await this.execute(conn, `DELETE FROM ${ref} WHERE ${matching(bind)}`, values))
				);
			};

			return {
				deletedCount: await purge(
					tableName,
					schemaName,
					[primaryKeys[0].columnName],
					primaryKeys.map((pk) => [pk.value]),
				),
			};
		});
	}

	async exportTableData({
		tableName,
		schemaName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		const rows = await this.connect(db, (conn) =>
			this.rows(conn, `SELECT * FROM ${this.tableRef(tableName, schemaName)}`),
		);

		if (!rows.length) {
			throw new HTTPException(404, {
				message: `Table "${tableName}" does not exist or has no data`,
			});
		}

		return { cols: Object.keys(rows[0]), rows };
	}
}
