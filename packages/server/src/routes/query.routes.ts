import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { executeQuery } from "@/dao/query.dao.js";
import { executeQuerySchema } from "@/types/create-table.type.js";

export const queryRoutes = new Hono();

/**
 * POST /query - Execute a SQL query
 */
queryRoutes.post("/", zValidator("json", executeQuerySchema), async (c) => {
	try {
		const { query, page, pageSize } = c.req.valid("json");

		const data = await executeQuery({ query, page, pageSize });
		return c.json(data);
	} catch (error) {
		console.error("POST /query error:", error);
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return c.json(
			{
				status: "error",
				error: errorMessage,
			},
			500,
		);
	}
});
