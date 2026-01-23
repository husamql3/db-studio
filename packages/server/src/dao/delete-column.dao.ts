import { HTTPException } from "hono/http-exception";
import { getDbPool } from "@/db-manager.js";
import type { DeleteColumnParamsSchemaType } from "./table-list.types.js";

/**
 * Deletes a column from a table using ALTER TABLE DROP COLUMN.
 * Uses CASCADE to drop dependent objects, or RESTRICT to fail if there are dependencies.
 *
 * @param params.tableName - Name of the table containing the column
 * @param params.columnName - Name of the column to delete
 * @param params.cascade - If true, uses CASCADE; if false, uses RESTRICT
 * @param params.database - Optional database name to connect to
 * @returns Success response with deleted column info and deleted count
 * @throws HTTPException if table or column does not exist
 */
export async function deleteColumn(
	params: DeleteColumnParamsSchemaType,
): Promise<{ deletedCount: number }> {
	const { tableName, columnName, cascade, database } = params;
	const pool = getDbPool(database);

	// Check if table exists
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

	// Check if column exists
	const columnExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns 
			WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: columnRows } = await pool.query(columnExistsQuery, [
		tableName,
		columnName,
	]);
	if (!columnRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	// Use CASCADE to drop dependent objects, or RESTRICT to fail if there are dependencies
	const dropMode = cascade ? "CASCADE" : "RESTRICT";
	const dropColumnSQL = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}" ${dropMode}`;

	const { rowCount } = await pool.query(dropColumnSQL);

	return { deletedCount: rowCount ?? 0 };
}
