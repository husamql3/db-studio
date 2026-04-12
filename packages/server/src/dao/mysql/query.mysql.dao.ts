import { HTTPException } from "hono/http-exception";
import type { FieldPacket, ResultSetHeader, RowDataPacket } from "mysql2";
import type { DatabaseSchemaType, ExecuteQueryParams, ExecuteQueryResult } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

export const executeQuery = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<ExecuteQueryResult> => {
	const pool = getMysqlPool(db);

	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	const cleanedQuery = query.trim().replace(/;+$/, "");

	const startTime = performance.now();
	// mysql2 returns [rows, fields] for SELECT and [ResultSetHeader, fields] for DML
	const [result, fields] = (await pool.execute(cleanedQuery)) as [
		RowDataPacket[] | ResultSetHeader,
		FieldPacket[],
	];
	const duration = performance.now() - startTime;

	// SELECT-like results have an array of rows
	if (Array.isArray(result)) {
		const rows = result as RowDataPacket[];
		const columns = fields ? fields.map((f) => f.name) : Object.keys(rows[0] ?? {});
		return {
			columns,
			rows: rows as Record<string, unknown>[],
			rowCount: rows.length,
			duration,
			message: rows.length === 0 ? "OK" : undefined,
		};
	}

	// DML results (INSERT, UPDATE, DELETE)
	const dmlResult = result as ResultSetHeader;
	return {
		columns: [],
		rows: [],
		rowCount: dmlResult.affectedRows,
		duration,
		message: `OK — ${dmlResult.affectedRows} row(s) affected`,
	};
};
