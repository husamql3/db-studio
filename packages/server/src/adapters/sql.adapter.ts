import type { DatabaseSchemaType } from "@db-studio/shared/types";
import { BaseAdapter } from "@/adapters/base.adapter.js";
import { HTTPException } from "@/http-exception.js";

/** An engine whose export reads the whole table with one `SELECT *`. */
export abstract class SqlAdapter extends BaseAdapter {
	protected abstract runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T>;

	protected abstract quoteIdentifier(name: string): string;

	async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		schemaName?: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		const rows = await this.runQuery<Record<string, unknown>[]>(
			db,
			`SELECT * FROM ${this.quoteIdentifier(tableName)}`,
			[],
		);

		if (!rows || rows.length === 0) {
			throw new HTTPException(404, {
				message: `Table "${tableName}" does not exist or has no data`,
			});
		}

		return { cols: Object.keys(rows[0]), rows };
	}
}
