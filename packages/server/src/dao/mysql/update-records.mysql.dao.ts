import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader } from "mysql2";
import type { DatabaseSchemaType, UpdateRecordsSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mysql.dao.js";

export async function updateRecords({
	params,
	db,
}: {
	params: UpdateRecordsSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<{ updatedCount: number }> {
	const { tableName, updates, primaryKey } = params;
	const pool = getMysqlPool(db);

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

	const connection = await pool.getConnection();
	await connection.beginTransaction();

	try {
		let totalUpdated = 0;

		for (const [pkValue, rowUpdates] of updatesByRow.entries()) {
			const setClauses = rowUpdates.map((u) => `\`${u.columnName}\` = ?`);
			const values = rowUpdates.map((u) => {
				if (u.value !== null && typeof u.value === "object") {
					return JSON.stringify(u.value);
				}
				if (booleanColumns.has(u.columnName) && typeof u.value === "string") {
					return u.value === "true" ? 1 : 0;
				}
				return u.value;
			});

			values.push(pkValue);

			const query = `
				UPDATE \`${tableName}\`
				SET ${setClauses.join(", ")}
				WHERE \`${primaryKey}\` = ?
			`;

			// biome-ignore lint/suspicious/noExplicitAny: mysql2 execute doesn't accept unknown[]
			const [result] = await connection.execute<ResultSetHeader>(query, values as any);

			if (result.affectedRows === 0) {
				throw new HTTPException(404, {
					message: `Record with ${primaryKey} = ${pkValue} not found in table "${tableName}"`,
				});
			}

			totalUpdated += result.affectedRows;
		}

		await connection.commit();
		return { updatedCount: totalUpdated };
	} catch (error) {
		await connection.rollback();

		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to update records in "${tableName}"`,
		});
	} finally {
		connection.release();
	}
}
