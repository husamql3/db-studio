import { db } from "@/db.js";

export type ExecuteQueryResponse = Record<string, unknown>[];

export const executeQuery = async (params: {
	query: string;
}): Promise<ExecuteQueryResponse> => {
	const { query } = params;
	const client = await db.connect();

	try {
		if (!query || !query.trim()) {
			throw new Error("Query cannot be empty");
		}

		console.log("Executing query:", query);
		const result = await client.query(query);
		console.log("result", result);

		return result.rows;
	} finally {
		client.release();
	}
};
