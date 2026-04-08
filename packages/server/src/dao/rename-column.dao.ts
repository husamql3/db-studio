import { HTTPException } from "hono/http-exception";
import type { RenameColumnParamsSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Renames a PostgreSQL column using ALTER TABLE RENAME COLUMN.
 */
export async function renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, newColumnName, db } = params;
	const pool = getDbPool(db);

	const tableExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = $1 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: tableRows } = await pool.query(tableExistsQuery, [tableName]);
	if (!tableRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	const columnExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: currentColumnRows } = await pool.query(columnExistsQuery, [
		tableName,
		columnName,
	]);
	if (!currentColumnRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const { rows: nextColumnRows } = await pool.query(columnExistsQuery, [
		tableName,
		newColumnName,
	]);
	if (nextColumnRows[0]?.exists) {
		throw new HTTPException(409, {
			message: `Column "${newColumnName}" already exists in table "${tableName}"`,
		});
	}

	await pool.query(
		`ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}"`,
	);
}
