import type { DatabaseSchemaType, RelatedRecord } from "@db-studio/shared/types";
import { BaseAdapter } from "@/adapters/base.adapter.js";
import { HTTPException } from "@/http-exception.js";

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
