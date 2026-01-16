import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { databaseQuerySchema, tableNameParamSchema } from "shared/types";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { handleConnectionError } from "@/utils/error-handler.js";

export const columnsRoutes = new Hono();

/**
 * GET /tables/:tableName/columns - Get all columns for a table
 */
columnsRoutes.get(
	"/",
	zValidator("param", tableNameParamSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const { tableName } = c.req.valid("param");
			const { database } = c.req.valid("query");

			const columns = await getTableColumns(tableName, database);
			console.log("GET /tables/:tableName/columns", columns);
			return c.json(columns);
		} catch (error) {
			console.error("GET /tables/:tableName/columns error:", error);
			return handleConnectionError(c, error, "Failed to fetch columns");
		}
	},
);
