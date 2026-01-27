import type { BulkInsertRecordsParams, BulkInsertResult } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const bulkInsertRecords = async (
	params: BulkInsertRecordsParams,
): Promise<BulkInsertResult> => {
	const { tableName, records, database } = params;

	if (!records || records.length === 0) {
		throw new Error("At least one record is required");
	}

	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		// Get column names from the first record
		const columns = Object.keys(records[0]);
		const columnNames = columns.map((col) => `"${col}"`).join(", ");

		let successCount = 0;
		let failureCount = 0;
		const errors: Array<{ recordIndex: number; error: string }> = [];

		// Execute inserts in a transaction
		await client.query("BEGIN");

		for (let i = 0; i < records.length; i++) {
			const record = records[i];
			const values = columns.map((col) => record[col]);

			const placeholders = columns
				.map((_, index) => `$${index + 1}`)
				.join(", ");

			const insertSQL = `
				INSERT INTO "${tableName}" (${columnNames})
				VALUES (${placeholders})
				RETURNING *
			`;

			try {
				await client.query(insertSQL, values);
				successCount++;
			} catch (error) {
				failureCount++;
				errors.push({
					recordIndex: i,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		await client.query("COMMIT");

		return {
			success: failureCount === 0,
			message: `Bulk insert completed: ${successCount} records inserted${failureCount > 0 ? `, ${failureCount} failed` : ""}`,
			successCount,
			failureCount,
			errors: errors.length > 0 ? errors : undefined,
		};
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("Error bulk inserting records:", error);
		throw error;
	} finally {
		client.release();
	}
};
