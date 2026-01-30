import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import type {
	AnalyzeQueryResult,
	DatabaseSchemaType,
	ExecuteQueryParams,
	ExecuteQueryResult,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

const SANDBOX_STATEMENT_TIMEOUT_MS = 8000;

export const executeQuery = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<ExecuteQueryResult> => {
	const pool = getDbPool(db);
	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	// Clean the query - remove trailing semicolons and whitespace
	const cleanedQuery = query.trim().replace(/;+$/, "");

	const startTime = performance.now();
	let result;
	try {
		result = await pool.query(cleanedQuery);
	} catch (error) {
		if (error instanceof DatabaseError) {
			const headers = new Headers();
			headers.set("Content-Type", "application/json");
			throw new HTTPException(400, {
				message: "Query failed",
				res: new Response(
					JSON.stringify({
						error: error.message,
						details: {
							code: error.code,
							position: error.position,
							detail: error.detail,
							hint: error.hint,
						},
					}),
					{ status: 400, statusText: "Bad Request", headers },
				),
			});
		}
		throw error;
	}
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

export const executeQuerySandbox = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<ExecuteQueryResult> => {
	const pool = getDbPool(db);
	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	const cleanedQuery = query.trim().replace(/;+$/, "");
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		await client.query("SET LOCAL statement_timeout = $1", [
			`${SANDBOX_STATEMENT_TIMEOUT_MS}`,
		]);

		const startTime = performance.now();
		let result;
		try {
			result = await client.query(cleanedQuery);
		} catch (error) {
			if (error instanceof DatabaseError) {
				const headers = new Headers();
				headers.set("Content-Type", "application/json");
				throw new HTTPException(400, {
					message: "Query failed",
					res: new Response(
						JSON.stringify({
							error: error.message,
							details: {
								code: error.code,
								position: error.position,
								detail: error.detail,
								hint: error.hint,
							},
						}),
						{ status: 400, statusText: "Bad Request", headers },
					),
				});
			}
			throw error;
		}
		const duration = performance.now() - startTime;

		const columns = result.fields.map((field) => field.name);

		await client.query("ROLLBACK");

		return {
			columns,
			rows: result.rows,
			rowCount: result.rows.length,
			duration,
			message: result.rows.length === 0 ? "OK" : undefined,
		};
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// Ignore rollback errors, original error is more important
		}
		throw error;
	} finally {
		client.release();
	}
};

export const analyzeQuery = async ({
	query,
	db,
}: {
	query: ExecuteQueryParams["query"];
	db: DatabaseSchemaType["db"];
}): Promise<AnalyzeQueryResult> => {
	const pool = getDbPool(db);
	if (!query || !query.trim()) {
		throw new HTTPException(400, {
			message: "Query is required",
		});
	}

	const cleanedQuery = query.trim().replace(/;+$/, "");
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		await client.query("SET LOCAL statement_timeout = $1", [
			`${SANDBOX_STATEMENT_TIMEOUT_MS}`,
		]);

		const result = await client.query(
			`EXPLAIN (ANALYZE, FORMAT JSON) ${cleanedQuery}`,
		);

		await client.query("ROLLBACK");

		const planJson = result.rows[0]?.["QUERY PLAN"];
		const planRoot = Array.isArray(planJson) ? planJson[0] : planJson;
		const executionTimeMs =
			typeof planRoot?.["Execution Time"] === "number"
				? planRoot["Execution Time"]
				: 0;

		return {
			plan: planJson,
			executionTimeMs,
		};
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// Ignore rollback errors
		}
		throw error;
	} finally {
		client.release();
	}
};
