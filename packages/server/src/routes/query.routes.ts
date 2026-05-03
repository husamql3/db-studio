import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { databaseSchema, type ExecuteQueryResult, executeQuerySchema } from "shared/types";
import { getAdapter } from "@/adapters/adapter.registry.js";
import type { ApiHandler, RouteEnv } from "@/app.types.js";

export const queryRoutes = new Hono<RouteEnv>()
	/**
	 * Base path for the endpoints, /:dbType/query/...
	 */
	.basePath("/query")

	/**
	 * POST /query
	 * Executes a SQL query on the currently connected database
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", executeQuerySchema),
		async (c): ApiHandler<ExecuteQueryResult> => {
			const { query } = c.req.valid("json");
			const { db } = c.req.valid("query");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const data = await dao.executeQuery({ query, db });
			return c.json({ data }, 200);
		},
	);

export type QueryRoutes = typeof queryRoutes;
