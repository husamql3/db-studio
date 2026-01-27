import { HTTPException } from "hono/http-exception";
import type { CellValue, DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export async function exportTableData({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<{ cols: string[]; rows: Record<string, CellValue>[] }> {
	const pool = getDbPool(db);
	const { rows } = await pool.query(`SELECT * FROM "${tableName}"`);

	if (!rows || rows.length === 0) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist or has no data`,
		});
	}

	const cols = Object.keys(rows[0]);

	return { cols, rows };
}
