import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { DeleteColumnParamsSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

/**
 * Deletes a column from a MySQL table using ALTER TABLE DROP COLUMN.
 * Note: MySQL does not support CASCADE/RESTRICT on DROP COLUMN — the cascade param is accepted
 * for API compatibility but does not change behavior.
 */
export async function deleteColumn(
	params: DeleteColumnParamsSchemaType,
): Promise<{ deletedCount: number }> {
	const { tableName, columnName, db } = params;
	const pool = getMysqlPool(db);

	// Check table exists
	const [tableRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		[tableName],
	);
	const tableExists = Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (!tableExists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// Check column exists
	const [columnRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[tableName, columnName],
	);
	const columnExists = Number((columnRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (!columnExists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const [result] = await pool.execute<ResultSetHeader>(
		`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``,
	);

	return { deletedCount: result.affectedRows };
}
