import { HTTPException } from "hono/http-exception";
import type {
	DatabaseSchemaType,
	ExecuteQueryParams,
	ExecuteQueryResult,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const executeQuery = async ({
	query,
	database,
}: {
	query: ExecuteQueryParams["query"];
	database: DatabaseSchemaType["database"];
}): Promise<ExecuteQueryResult> => {
	const pool = getDbPool(database);
	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	// Clean the query - remove trailing semicolons and whitespace
	const cleanedQuery = query.trim().replace(/;+$/, "");

	const startTime = performance.now();
	const result = await pool.query(cleanedQuery);
	const duration = performance.now() - startTime;

	const columns = result.fields.map((field) => field.name);

	return {
		columns,
		rows: result.rows,
		rowCount: result.rows.length,
		duration,
		message: result.rows.length === 0 ? "OK" : undefined,
	};
};
