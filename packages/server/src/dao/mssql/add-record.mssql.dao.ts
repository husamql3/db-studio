import { HTTPException } from "hono/http-exception";
import type { AddRecordSchemaType, DatabaseSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mssql.dao.js";

export async function addRecord({
	db,
	params,
}: {
	db: DatabaseSchemaType["db"];
	params: AddRecordSchemaType;
}): Promise<{ insertedCount: number }> {
	const { tableName, data } = params;
	const pool = await getMssqlPool(db);

	const tableColumns = await getTableColumns({ tableName, db });
	const booleanColumns = new Set(
		tableColumns.filter((col) => col.dataTypeLabel === "boolean").map((col) => col.columnName),
	);

	const columns = Object.keys(data);
	const values = Object.values(data).map((value, index) => {
		const columnName = columns[index];
		if (booleanColumns.has(columnName) && typeof value === "string") {
			return value === "true" ? 1 : 0;
		}
		return value;
	});

	const columnNames = columns.map((col) => `[${col}]`).join(", ");
	const paramNames = columns.map((_col, idx) => `@param${idx}`).join(", ");

	const query = `
		INSERT INTO [${tableName}] (${columnNames})
		VALUES (${paramNames})
	`;

	const request = pool.request();
	columns.forEach((_col, idx) => {
		request.input(`param${idx}`, values[idx]);
	});

	const result = await request.query(query);

	if (result.rowsAffected[0] === 0) {
		throw new HTTPException(500, {
			message: `Failed to insert record into "${tableName}"`,
		});
	}

	return { insertedCount: result.rowsAffected[0] ?? 0 };
}
