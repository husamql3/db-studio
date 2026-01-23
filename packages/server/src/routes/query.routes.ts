import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { databaseSchema, executeQuerySchema } from "shared/types";
import { executeQuery } from "@/dao/query.dao.js";

export const queryRoutes = new Hono();

/**
 * POST /query - Execute a SQL query
 */
queryRoutes.post(
	"/",
	zValidator("query", databaseSchema),
	zValidator("json", executeQuerySchema),
	async (c) => {
		try {
			const { query } = c.req.valid("json");
			const { database } = c.req.valid("query");

			const data = await executeQuery({ query, database });
			return c.json(data);
		} catch (error) {
			console.error("POST /query error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{
					status: "error",
					error: errorMessage,
				},
				500,
			);
		}
	},
);

export type QueryRoutes = typeof queryRoutes;
