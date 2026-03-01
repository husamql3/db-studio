import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader } from "mysql2";
import type { AddRecordSchemaType, DatabaseSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { getTableColumns } from "./table-columns.mysql.dao.js";

export async function addRecord({
	db,
	params,
}: {
	db: DatabaseSchemaType["db"];
	params: AddRecordSchemaType;
}): Promise<{ insertedCount: number }> {
	const { tableName, data } = params;
	const pool = getMysqlPool(db);

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

	const placeholders = columns.map(() => "?").join(", ");
	const columnNames = columns.map((col) => `\`${col}\``).join(", ");

	const query = `
		INSERT INTO \`${tableName}\` (${columnNames})
		VALUES (${placeholders})
	`;

	const [result] = await pool.execute<ResultSetHeader>(query, values);

	if (result.affectedRows === 0) {
		throw new HTTPException(500, {
			message: `Failed to insert record into "${tableName}"`,
		});
	}

	return { insertedCount: result.affectedRows };
}
