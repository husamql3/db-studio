import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, ExecuteQueryParams, ExecuteQueryResult } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

export const executeQuery = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<ExecuteQueryResult> => {
	const pool = await getMssqlPool(db);

	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	const cleanedQuery = query.trim().replace(/;+$/, "");

	const startTime = performance.now();
	const result = await pool.request().query(cleanedQuery);
	const duration = performance.now() - startTime;

	// Check if query returned data (SELECT-like)
	if (result.recordset) {
		const rows = result.recordset as Record<string, unknown>[];
		const columns = result.recordset.columns
			? Object.keys(result.recordset.columns)
			: Object.keys(rows[0] ?? {});

		return {
			columns,
			rows,
			rowCount: rows.length,
			duration,
			message: rows.length === 0 ? "OK" : undefined,
		};
	}

	// DML results (INSERT, UPDATE, DELETE)
	return {
		columns: [],
		rows: [],
		rowCount: result.rowsAffected[0] ?? 0,
		duration,
		message: `OK — ${result.rowsAffected[0] ?? 0} row(s) affected`,
	};
};
