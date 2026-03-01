import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader } from "mysql2";
import type { BulkInsertRecordsParams, BulkInsertResult } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mysql.dao.js";

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

	const pool = getMysqlPool(db);
	const connection = await pool.getConnection();

	try {
		const columns = Object.keys(records[0]);
		const columnNames = columns.map((col) => `\`${col}\``).join(", ");

		const tableColumns = await getTableColumns({ tableName, db });
		const booleanColumns = new Set(
			tableColumns
				.filter((col) => col.dataTypeLabel === "boolean")
				.map((col) => col.columnName),
		);

		await connection.beginTransaction();

		for (let i = 0; i < records.length; i++) {
			const record = records[i];
			const values = columns.map((col) => {
				const value = record[col];
				if (booleanColumns.has(col) && typeof value === "string") {
					return value === "true" ? 1 : 0;
				}
				return value;
			});
			const placeholders = columns.map(() => "?").join(", ");

			const insertSQL = `
				INSERT INTO \`${tableName}\` (${columnNames})
				VALUES (${placeholders})
			`;

			try {
				// biome-ignore lint/suspicious/noExplicitAny: mysql2 execute doesn't accept unknown[]
				await connection.execute<ResultSetHeader>(insertSQL, values as any);
			} catch (error) {
				throw new HTTPException(500, {
					message: `Failed to insert record ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		await connection.commit();

		return {
			success: true,
			message: `Successfully inserted ${records.length} record${records.length !== 1 ? "s" : ""}`,
			successCount: records.length,
			failureCount: 0,
		};
	} catch (error) {
		await connection.rollback();
		if (error instanceof HTTPException) throw error;
		throw new HTTPException(500, {
			message: `Failed to bulk insert records into "${tableName}"`,
		});
	} finally {
		connection.release();
	}
};
