import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { AlterColumnParamsSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { buildMysqlColumnDefinition } from "./mysql-column.utils.js";

/**
 * Alters a MySQL column's type, nullability, and default value using MODIFY COLUMN.
 */
export async function alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
	const pool = getMysqlPool(db);

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

	const [columnRows] = await pool.execute<RowDataPacket[]>(
		`SELECT EXTRA
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
		 LIMIT 1`,
		[tableName, columnName],
	);
	const columnRow = (columnRows as Array<{ EXTRA?: string | null }>)[0];
	if (!columnRow) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const columnDefinition = buildMysqlColumnDefinition(
		{
			columnName,
			columnType,
			defaultValue,
			isNullable,
		},
		{
			preserveAutoIncrement: columnRow.EXTRA?.toLowerCase().includes("auto_increment"),
		},
	);

	await pool.execute<ResultSetHeader>(
		`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${columnDefinition}`,
	);
}
