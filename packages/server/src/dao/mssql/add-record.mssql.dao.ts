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

	// Fetch identity columns and exclude them from the insert
	const identityResult = await pool
		.request()
		.input("tableName", tableName)
		.query(
			`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@tableName) AND is_identity = 1`,
		);
	const identityColumns = new Set(
		(identityResult.recordset as { name: string }[]).map((r) => r.name),
	);

	const columns = Object.keys(data).filter((col) => !identityColumns.has(col));
	const values = columns.map((col) => {
		const value = data[col];
		if (booleanColumns.has(col) && typeof value === "string") {
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
