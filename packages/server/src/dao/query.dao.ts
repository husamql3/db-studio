import { getDbPool } from "@/db-manager.js";

export type ExecuteQueryResponse = {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	duration: number;
	message?: string;
	error?: string;
};

export const executeQuery = async (params: {
	query: string;
	database?: string;
}): Promise<ExecuteQueryResponse> => {
	const { query, database } = params;
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		if (!query || !query.trim()) {
			throw new Error("Query cannot be empty");
		}

		// Clean the query - remove trailing semicolons and whitespace
		const cleanedQuery = query.trim().replace(/;+$/, "");

		console.log("executeQuery query:", cleanedQuery);
		const startTime = performance.now();
		const result = await client.query(cleanedQuery);
		const duration = performance.now() - startTime;

		const columns = result.fields.map((field) => field.name);

		return {
			columns,
			rows: result.rows,
			rowCount: result.rows.length,
			duration,
			message: result.rows.length === 0 ? "OK" : undefined,
		};
	} catch (error) {
		console.error("Error executing query:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error occurred";
		throw new Error(errorMessage);
	} finally {
		client.release();
	}
};
