import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, UpdateRecordsSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mssql.dao.js";

export async function updateRecords({
	params,
	db,
}: {
	params: UpdateRecordsSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<{ updatedCount: number }> {
	const { tableName, updates, primaryKey } = params;
	const pool = await getMssqlPool(db);

	const tableColumns = await getTableColumns({ tableName, db });
	const booleanColumns = new Set(
		tableColumns.filter((col) => col.dataTypeLabel === "boolean").map((col) => col.columnName),
	);

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
				message: `Primary key "${primaryKey}" not found in row data.`,
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

	const transaction = pool.transaction();
	await transaction.begin();

	try {
		let totalUpdated = 0;

		for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
			const setClauses = rowUpdates.map((u, idx) => `[${u.columnName}] = @value${idx}`);
			const request = transaction.request();

			rowUpdates.forEach((u, idx) => {
				let value = u.value;
				if (value !== null && typeof value === "object") {
					value = JSON.stringify(value);
				}
				if (booleanColumns.has(u.columnName) && typeof value === "string") {
					value = value === "true" ? 1 : 0;
				}
				request.input(`value${idx}`, value);
			});

			request.input("pkValue", pkValue);

			const query = `
				UPDATE [${tableName}]
				SET ${setClauses.join(", ")}
				WHERE [${primaryKey}] = @pkValue
			`;

			const result = await request.query(query);

			if (result.rowsAffected[0] === 0) {
				throw new HTTPException(404, {
					message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
				});
			}

			totalUpdated += result.rowsAffected[0] ?? 0;
		}

		await transaction.commit();
		return { updatedCount: totalUpdated };
	} catch (error) {
		await transaction.rollback();

		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to update records in "${tableName}"`,
		});
	}
}
