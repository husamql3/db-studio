import { db } from "@/db.js";

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
}): Promise<ExecuteQueryResponse> => {
	const { query } = params;
	const client = await db.connect();

	try {
		if (!query || !query.trim()) {
			throw new Error("Query cannot be empty");
		}

		const startTime = performance.now();

		// Clean the query - remove trailing semicolons and whitespace
		const cleanedQuery = query.trim().replace(/;+$/, "");

		console.log("query", cleanedQuery);
		const result = await client.query(cleanedQuery);
		console.log("result", result);
		const duration = performance.now() - startTime;

		const columns = result.fields.map((field) => field.name);
		const rowCount = result.rowCount ?? result.rows.length;

		return {
			columns,
			rows: result.rows,
			rowCount,
			duration,
			message: rowCount === 0 ? "OK" : undefined,
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
