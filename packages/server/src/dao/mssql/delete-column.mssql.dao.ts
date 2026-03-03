import { HTTPException } from "hono/http-exception";
import type { DeleteColumnParamsSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

/**
 * Deletes a column from a SQL Server table using ALTER TABLE DROP COLUMN
 */
export async function deleteColumn(
	params: DeleteColumnParamsSchemaType,
): Promise<{ deletedCount: number }> {
	const { tableName, columnName, db } = params;
	const pool = await getMssqlPool(db);

	// Check table exists
	const tableCheckResult = await pool
		.request()
		.input("tableName", tableName)
		.query(`
			SELECT COUNT(*) as cnt
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_CATALOG = DB_NAME()
			  AND TABLE_NAME = @tableName
			  AND TABLE_SCHEMA = 'dbo'
		`);

	const tableExists = Number(tableCheckResult.recordset[0]?.cnt ?? 0) > 0;
	if (!tableExists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// Check column exists
	const columnCheckResult = await pool
		.request()
		.input("tableName", tableName)
		.input("columnName", columnName)
		.query(`
			SELECT COUNT(*) as cnt
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_CATALOG = DB_NAME()
			  AND TABLE_NAME = @tableName
			  AND COLUMN_NAME = @columnName
			  AND TABLE_SCHEMA = 'dbo'
		`);

	const columnExists = Number(columnCheckResult.recordset[0]?.cnt ?? 0) > 0;
	if (!columnExists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const result = await pool
		.request()
		.query(`ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`);

	return { deletedCount: result.rowsAffected[0] ?? 1 };
}
