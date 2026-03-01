import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { databaseSchema, type ExecuteQueryResult, executeQuerySchema } from "shared/types";
import type { ApiHandler, RouteEnv } from "@/app.types.js";
import { executeQuery as mysqlExecuteQuery } from "@/dao/mysql/query.mysql.dao.js";
import { executeQuery as pgExecuteQuery } from "@/dao/query.dao.js";

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
			const data =
				dbType === "mysql"
					? await mysqlExecuteQuery({ query, db })
					: await pgExecuteQuery({ query, db });
			return c.json({ data }, 200);
		},
	);

export type QueryRoutes = typeof queryRoutes;
