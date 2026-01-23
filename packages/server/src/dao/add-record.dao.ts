import { HTTPException } from "hono/http-exception";
import type { AddRecordSchemaType, DatabaseSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export async function addRecord({
	database,
	params,
}: {
	database: DatabaseSchemaType["database"];
	params: AddRecordSchemaType;
}): Promise<{ insertedCount: number }> {
	const { tableName, data } = params;
	const pool = getDbPool(database);

	// Extract column names and values
	const columns = Object.keys(data);
	const values = Object.values(data);

	// Build the INSERT query
	const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
	const columnNames = columns.map((col) => `"${col}"`).join(", ");

	const query = `
			INSERT INTO "${tableName}" (${columnNames})
			VALUES (${placeholders})
			RETURNING *
		`;

	const result = await pool.query(query, values);
	if (result.rowCount === 0) {
		throw new HTTPException(500, {
			message: `Failed to insert record into "${tableName}"`,
		});
	}

	return { insertedCount: result.rowCount ?? 0 };
}
