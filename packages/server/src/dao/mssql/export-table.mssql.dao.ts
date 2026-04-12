import { HTTPException } from "hono/http-exception";
import type { CellValue, DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

export async function exportTableData({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<{ cols: string[]; rows: Record<string, CellValue>[] }> {
	const pool = await getMssqlPool(db);
	const result = await pool.request().query(`SELECT * FROM [${tableName}]`);

	if (!result.recordset || result.recordset.length === 0) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist or has no data`,
		});
	}

	const cols = Object.keys(result.recordset[0]);

	return { cols, rows: result.recordset as Record<string, CellValue>[] };
}
