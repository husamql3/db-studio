import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { databaseSchema, type ExecuteQueryResult, executeQuerySchema } from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { executeQuery } from "@/dao/query.dao.js";
import { executeMongoQuery } from "@/dao/mongo/query.dao.js";

export const queryRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/query/...
	 */
	.basePath("/query")

	/**
	 * POST /query
	 * Executes a SQL query on the currently connected database
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {ExecuteQuerySchemaType} json - The query to execute
	 * @returns {ApiHandler<ExecuteQueryResult>} The result of the query
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
				dbType === "mongodb"
					? await executeMongoQuery({ query, db })
					: await executeQuery({ query, db });
			return c.json({ data }, 200);
		},
	);

export type QueryRoutes = typeof queryRoutes;
