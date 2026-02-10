import { HTTPException } from "hono/http-exception";
import type { BulkInsertRecordsParams, BulkInsertResult } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const bulkInsertRecords = async ({
	tableName,
	records,
	db,
}: BulkInsertRecordsParams): Promise<BulkInsertResult> => {
	if (!records || records.length === 0) {
		throw new HTTPException(400, {
			message: "At least one record is required",
		});
	}

	const pool = getDbPool(db);
	const client = await pool.connect();

	try {
		// Get column names from the first record
		const columns = Object.keys(records[0]);
		const columnNames = columns.map((col) => `"${col}"`).join(", ");

		let successCount = 0;
		const failureCount = 0;
		const errors: Array<{ recordIndex: number; error: string }> = [];

		// Execute inserts in a transaction
		await client.query("BEGIN");

		for (let i = 0; i < records.length; i++) {
			const record = records[i];
			const values = columns.map((col) => record[col]);

			const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

			const insertSQL = `
				INSERT INTO "${tableName}" (${columnNames})
				VALUES (${placeholders})
				RETURNING *
			`;

			try {
				await client.query(insertSQL, values);
				successCount++;
			} catch (error) {
				throw new HTTPException(500, {
					message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
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
		if (error instanceof HTTPException) {
			throw error;
		}
		throw new HTTPException(500, {
			message: `Failed to bulk insert records into "${tableName}"`,
		});
	} finally {
		client.release();
	}
};
