import { HTTPException } from "hono/http-exception";
import type { BulkInsertRecordsParams, BulkInsertResult } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mssql.dao.js";

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

	const pool = await getMssqlPool(db);
	const transaction = pool.transaction();

	try {
		const columns = Object.keys(records[0]);
		const columnNames = columns.map((col) => `[${col}]`).join(", ");

		const tableColumns = await getTableColumns({ tableName, db });
		const booleanColumns = new Set(
			tableColumns
				.filter((col) => col.dataTypeLabel === "boolean")
				.map((col) => col.columnName),
		);

		await transaction.begin();

		for (let i = 0; i < records.length; i++) {
			const record = records[i];
			const request = transaction.request();
			const values = columns.map((col) => {
				const value = record[col];
				if (booleanColumns.has(col) && typeof value === "string") {
					return value === "true" ? 1 : 0;
				}
				return value;
			});

			const paramNames = columns.map((_, idx) => `@p${i}_${idx}`).join(", ");
			columns.forEach((_col, idx) => {
				request.input(`p${i}_${idx}`, values[idx]);
			});

			const insertSQL = `
				INSERT INTO [${tableName}] (${columnNames})
				VALUES (${paramNames})
			`;

			try {
				await request.query(insertSQL);
			} catch (error) {
				throw new HTTPException(500, {
					message: `Failed to insert record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		await transaction.commit();

		return {
			success: true,
			message: `Successfully inserted ${records.length} record${records.length !== 1 ? "s" : ""}`,
			successCount: records.length,
			failureCount: 0,
		};
	} catch (error) {
		await transaction.rollback();
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, {
			message: `Failed to bulk insert records into "${tableName}"`,
		});
	}
};
