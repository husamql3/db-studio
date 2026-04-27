import { HTTPException } from "hono/http-exception";
import type { AlterColumnParamsSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

/**
 * Alters a SQL Server column's type, nullability, and default value.
 * Drops/re-creates the default constraint since MSSQL names them automatically.
 */
export async function alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
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

	// Drop existing default constraint if present
	const defaultConstraintResult = await pool
		.request()
		.input("tableName", tableName)
		.input("columnName", columnName)
		.query(
			`SELECT dc.name AS constraint_name
			 FROM sys.default_constraints dc
			 JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
			 WHERE OBJECT_NAME(dc.parent_object_id) = @tableName AND c.name = @columnName`,
		);
	const constraintName = defaultConstraintResult.recordset[0]?.constraint_name as string | undefined;
	if (constraintName) {
		await pool.request().query(`ALTER TABLE [${tableName}] DROP CONSTRAINT [${constraintName}]`);
	}

	const nullability = isNullable ? "NULL" : "NOT NULL";
	await pool
		.request()
		.query(`ALTER TABLE [${tableName}] ALTER COLUMN [${columnName}] ${columnType} ${nullability}`);

	if (defaultValue?.trim()) {
		await pool
			.request()
			.query(`ALTER TABLE [${tableName}] ADD DEFAULT ${defaultValue.trim()} FOR [${columnName}]`);
	}
}
