import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { RenameColumnParamsSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

/**
 * Renames a MySQL column using ALTER TABLE RENAME COLUMN.
 */
export async function renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, newColumnName, db } = params;
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

	const [currentColumnRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[tableName, columnName],
	);
	const currentColumnExists =
		Number((currentColumnRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (!currentColumnExists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const [nextColumnRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[tableName, newColumnName],
	);
	const nextColumnExists = Number((nextColumnRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (nextColumnExists) {
		throw new HTTPException(409, {
			message: `Column "${newColumnName}" already exists in table "${tableName}"`,
		});
	}

	await pool.execute<ResultSetHeader>(
		`ALTER TABLE \`${tableName}\` RENAME COLUMN \`${columnName}\` TO \`${newColumnName}\``,
	);
}
