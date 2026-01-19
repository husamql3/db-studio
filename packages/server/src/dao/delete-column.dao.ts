import type { DeleteColumnParams, DeleteColumnResponse } from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Deletes a column from a table using ALTER TABLE DROP COLUMN
 * @param params.cascade - If true, uses CASCADE to drop dependent objects (indexes, constraints, foreign keys)
 *                         If false, uses RESTRICT which will fail if there are dependencies
 */
export const deleteColumn = async (
	params: DeleteColumnParams,
	database?: string,
): Promise<DeleteColumnResponse> => {
	const { tableName, columnName, cascade = false } = params;
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		// Use CASCADE to drop dependent objects, or RESTRICT to fail if there are dependencies
		const dropMode = cascade ? "CASCADE" : "RESTRICT";
		const dropColumnSQL = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}" ${dropMode}`;

		console.log("Deleting column with SQL:", dropColumnSQL);
		await client.query(dropColumnSQL);

		return {
			success: true,
			message: `Column "${columnName}" deleted successfully from table "${tableName}"`,
			tableName,
			columnName,
			deletedCount: 1,
		};
	} catch (error) {
		console.error("Error deleting column:", error);

		// Check for specific PostgreSQL errors
		const pgError = error as { code?: string; message?: string };

		if (pgError.code === "42703") {
			// Column does not exist
			throw new Error(
				`Column "${columnName}" does not exist in table "${tableName}"`,
			);
		}

		if (pgError.code === "42P01") {
			// Table does not exist
			throw new Error(`Table "${tableName}" does not exist`);
		}

		throw error;
	} finally {
		client.release();
	}
};
