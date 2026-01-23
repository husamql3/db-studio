import { z } from "zod";

export const executeQuerySchema = z.object({
	query: z.string("Query is required"),
});
