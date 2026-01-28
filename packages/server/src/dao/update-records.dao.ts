import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, UpdateRecordsSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Updates multiple cells in a table. Can update multiple rows or multiple cells in the same row.
 * Groups updates by row and executes them efficiently.
 */
export async function updateRecords({
	params,
	db,
}: {
	params: UpdateRecordsSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<{ updatedCount: number }> {
	const { tableName, updates, primaryKey } = params;
	const pool = getDbPool(db);

	// Group updates by row (using the primary key value)
	const updatesByRow = new Map<
		unknown,
		Array<{
			columnName: string;
			value: unknown;
			rowData: Record<string, unknown>;
		}>
	>();

	for (const update of updates) {
		const pkValue = update.rowData[primaryKey];
		if (pkValue === undefined || pkValue === null) {
			throw new HTTPException(400, {
				message: `Primary key "${primaryKey}" not found in row data. Please ensure the row has a "${primaryKey}" column.`,
			});
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

	// Use transaction for multiple updates
	await pool.query("BEGIN");

	try {
		let totalUpdated = 0;

		// Execute updates for each row
		for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
			const setClauses = rowUpdates.map((u, index) => `"${u.columnName}" = $${index + 1}`);
			const values = rowUpdates.map((u) => {
				// If the value is an object or array, stringify it for JSON/JSONB columns
				if (u.value !== null && typeof u.value === "object") {
					return JSON.stringify(u.value);
				}
				return u.value;
			});

			// Add the primary key value as the last parameter
			values.push(pkValue);

			const query = `
				UPDATE "${tableName}"
				SET ${setClauses.join(", ")}
				WHERE "${primaryKey}" = $${values.length}
				RETURNING *
			`;

			const result = await pool.query(query, values);
			if (result.rowCount === 0) {
				throw new HTTPException(404, {
					message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
				});
			}

			totalUpdated += result.rowCount ?? 0;
		}

		await pool.query("COMMIT");

		return { updatedCount: totalUpdated };
	} catch (error) {
		await pool.query("ROLLBACK");

		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to update records in "${tableName}"`,
		});
	}
}
