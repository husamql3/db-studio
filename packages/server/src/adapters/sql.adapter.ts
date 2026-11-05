import type {
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	RelatedRecord,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { BaseAdapter, notImplemented } from "@/adapters/base.adapter.js";
import { createBinds } from "@/adapters/sql-filters.js";
import { HTTPException } from "@/http-exception.js";

type Bind = (value: unknown) => string;

/**
 * A written value for a driver that takes neither objects nor the grid's "true"/"false" for a
 * boolean column: JSON as text, and the boolean as 1 or 0.
 */
export const flagOrJson = (value: unknown, isBoolean: boolean) => {
	if (value !== null && typeof value === "object") return JSON.stringify(value);

	if (isBoolean && typeof value === "string") return value === "true" ? 1 : 0;

	return value;
};

/** How an update writes a value into `column`: the SQL for it, binding through `bind`. */
export type BindValue = (column: string, value: unknown, bind: Bind) => string;

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

/**
 * A relational engine. Each one supplies its connection, quoting and catalog hooks; the
 * operations every engine does the same way are written once here.
 */
export abstract class SqlAdapter<Conn> extends BaseAdapter {
	protected abstract readonly quoteIdentifier: (name: string) => string;
	/** The n-th bound value's placeholder, counting from 1. */
	protected abstract readonly placeholder: (position: number) => string;

	/** Runs `work` with a connection to `db`. */
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
