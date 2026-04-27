import { HTTPException } from "hono/http-exception";
import type { RenameColumnParamsSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

/**
 * Renames a SQL Server column via the sp_rename system stored procedure.
 */
export async function renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, newColumnName, db } = params;
	const pool = await getMssqlPool(db);

	const tableCheck = await pool
		.request()
		.input("tableName", tableName)
		.query(
			`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
			 WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND TABLE_SCHEMA = 'dbo'`,
		);
	if (Number(tableCheck.recordset[0]?.cnt ?? 0) === 0) {
		throw new HTTPException(404, { message: `Table "${tableName}" does not exist` });
	}

	const colCheck = await pool
		.request()
		.input("tableName", tableName)
		.input("columnName", columnName)
		.query(
			`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName AND TABLE_SCHEMA = 'dbo'`,
		);
	if (Number(colCheck.recordset[0]?.cnt ?? 0) === 0) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const newColCheck = await pool
		.request()
		.input("tableName", tableName)
		.input("columnName", newColumnName)
		.query(
			`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_CATALOG = DB_NAME() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName AND TABLE_SCHEMA = 'dbo'`,
		);
	if (Number(newColCheck.recordset[0]?.cnt ?? 0) > 0) {
		throw new HTTPException(409, {
			message: `Column "${newColumnName}" already exists in table "${tableName}"`,
		});
	}

	await pool
		.request()
		.query(`EXEC sp_rename '${tableName}.${columnName}', '${newColumnName}', 'COLUMN'`);
}
