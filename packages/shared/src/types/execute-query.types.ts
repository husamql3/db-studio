import { z } from "zod";

export const executeQuerySchema = z.object({
	query: z.string("Query is required").trim().min(1, "Query is required"),
});

export type ExecuteQueryResult = {
	columns: string[];
	rows: Record<string, unknown>[];
	rowCount: number;
	duration: number;
	message?: string;
	error?: string;
};
