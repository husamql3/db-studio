import { HTTPException } from "hono/http-exception";
import type { AddColumnParamsSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

/**
 * Adds a column to a SQL Server table using ALTER TABLE ADD.
 */
export async function addColumn(params: AddColumnParamsSchemaType): Promise<void> {
	const {
		tableName,
		columnName,
		columnType,
		defaultValue,
		isPrimaryKey,
		isNullable,
		isUnique,
		isIdentity,
		db,
	} = params;
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
	if (Number(colCheck.recordset[0]?.cnt ?? 0) > 0) {
		throw new HTTPException(409, {
			message: `Column "${columnName}" already exists in table "${tableName}"`,
		});
	}

	let colDef = `[${columnName}] ${columnType}`;
	if (isIdentity) {
		colDef += " IDENTITY(1,1)";
	}
	if (isPrimaryKey) {
		colDef += " PRIMARY KEY";
	}
	if (isUnique && !isPrimaryKey) {
		colDef += " UNIQUE";
	}
	colDef += isNullable ? " NULL" : " NOT NULL";
	if (defaultValue?.trim() && !isIdentity) {
		colDef += ` DEFAULT ${defaultValue.trim()}`;
	}

	await pool.request().query(`ALTER TABLE [${tableName}] ADD ${colDef}`);
}
