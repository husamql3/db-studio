import { getDbPool } from "@/db-manager.js";

export interface InsertRecordParams {
	tableName: string;
	data: Record<string, unknown>;
	database?: string;
}

export const insertRecord = async (params: InsertRecordParams) => {
	const { tableName, data, database } = params;
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		// Extract column names and values
		const columns = Object.keys(data);
		const values = Object.values(data);

		// Build the INSERT query
		const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
		const columnNames = columns.map((col) => `"${col}"`).join(", ");

		const insertSQL = `
			INSERT INTO "${tableName}" (${columnNames})
			VALUES (${placeholders})
			RETURNING *
		`;

		console.log("Inserting record with SQL:", insertSQL, "Values:", values);
		const result = await client.query(insertSQL, values);

		return {
			success: true,
			message: `Record inserted into "${tableName}" successfully`,
			data: result.rows[0],
		};
	} catch (error) {
		console.error("Error inserting record:", error);
		throw error;
	} finally {
		client.release();
	}
};
