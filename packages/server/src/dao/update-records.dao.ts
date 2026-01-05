import { db } from "@/db.js";

export interface UpdateRecordParams {
	tableName: string;
	updates: Array<{
		rowData: Record<string, unknown>; // Original row data to identify the record
		columnName: string;
		value: unknown;
	}>;
	primaryKey?: string; // Optional: specify primary key column (defaults to 'id')
}

/**
 * Updates multiple cells in a table. Can update multiple rows or multiple cells in the same row.
 * Groups updates by row and executes them efficiently.
 */
export const updateRecords = async (params: UpdateRecordParams) => {
	const { tableName, updates, primaryKey = "id" } = params;
	const client = await db.connect();

	try {
		await client.query("BEGIN");

		// Group updates by row (using the primary key value)
		const updatesByRow = new Map<
			unknown,
			Array<{ columnName: string; value: unknown; rowData: Record<string, unknown> }>
		>();

		for (const update of updates) {
			const pkValue = update.rowData[primaryKey];
			if (pkValue === undefined) {
				throw new Error(
					`Primary key "${primaryKey}" not found in row data. Please ensure the row has a primary key.`,
				);
			}

			if (!updatesByRow.has(pkValue)) {
				updatesByRow.set(pkValue, []);
			}
			updatesByRow.get(pkValue)?.push({
				columnName: update.columnName,
				value: update.value,
				rowData: update.rowData,
			});
		}

		const results = [];
		let totalUpdated = 0;

		// Execute updates for each row
		for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
			const setClauses = rowUpdates.map(
				(u, index) => `"${u.columnName}" = $${index + 1}`,
			);
			const values = rowUpdates.map((u) => {
				console.log(`Value for ${u.columnName}:`, typeof u.value, u.value);
				// If the value is an object or array, stringify it for JSON/JSONB columns
				if (u.value !== null && typeof u.value === "object") {
					return JSON.stringify(u.value);
				}
				return u.value;
			});

			// Add the primary key value as the last parameter
			values.push(pkValue);

			const updateSQL = `
				UPDATE "${tableName}"
				SET ${setClauses.join(", ")}
				WHERE "${primaryKey}" = $${values.length}
				RETURNING *
			`;

			console.log("Updating record with SQL:", updateSQL, "Values:", values);
			const result = await client.query(updateSQL, values);

			if (result.rowCount === 0) {
				throw new Error(
					`Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
				);
			}

			results.push(result.rows[0]);
			totalUpdated += result.rowCount || 0;
		}

		await client.query("COMMIT");

		return {
			success: true,
			message: `Successfully updated ${totalUpdated} ${totalUpdated === 1 ? "row" : "rows"} in "${tableName}"`,
			data: results,
			updatedCount: totalUpdated,
		};
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("Error updating records:", error);
		throw error;
	} finally {
		client.release();
	}
};
