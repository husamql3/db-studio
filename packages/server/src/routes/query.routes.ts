import { databaseSchema, executeQuerySchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const queryRoutes = new Elysia({ prefix: "/query" })
	.use(adapterPlugin)

	/**
	 * POST /query
	 * Executes a SQL query on the currently connected database
	 */
	.post(
		"/",
		async ({ adapter, query: { db }, body: { query } }) => ({
			data: await adapter.executeQuery({ query, db }),
		}),
		{ query: databaseSchema, body: executeQuerySchema },
	);
