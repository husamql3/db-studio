import { db } from "@/db.js";

export type ExecuteQueryResponse = {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	duration: number;
	error?: string;
};

export const executeQuery = async (params: {
	query: string;
	page: number;
	pageSize: number;
}): Promise<ExecuteQueryResponse> => {
	const { query, page, pageSize } = params;
	const client = await db.connect();

	try {
		if (!query || !query.trim()) {
			throw new Error("Query cannot be empty");
		}

		const startTime = performance.now();

		// Calculate offset for pagination and ensure values are integers
		const limit = Math.max(1, Math.floor(pageSize));
		const offset = Math.max(0, Math.floor((page - 1) * pageSize));

		// Clean the query - remove trailing semicolons and whitespace
		const cleanedQuery = query.trim().replace(/;+$/, "");

		// Wrap the user's query in a subquery and apply LIMIT/OFFSET
		// Using string interpolation for LIMIT/OFFSET is safe since these are controlled numbers, not user input
		const paginatedQuery = `SELECT * FROM (${cleanedQuery}) AS subquery LIMIT ${limit} OFFSET ${offset}`;

		const result = await client.query(paginatedQuery);
		const duration = performance.now() - startTime;

		const columns = result.fields.map((field) => field.name);

		return {
			columns,
			rows: result.rows,
			rowCount: result.rowCount ?? result.rows.length,
			duration,
		};
	} catch (error) {
		console.error("Error executing query:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error occurred";

		return {
			columns: [],
			rows: [],
			rowCount: 0,
			duration: 0,
			error: errorMessage,
		};
	} finally {
		client.release();
	}
};
