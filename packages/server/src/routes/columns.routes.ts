import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { tableNameParamSchema } from "@/types/create-table.type.js";
import { handleConnectionError } from "@/utils/error-handler.js";

export const columnsRoutes = new Hono();

/**
 * GET /tables/:tableName/columns - Get all columns for a table
 */
columnsRoutes.get("/", zValidator("param", tableNameParamSchema), async (c) => {
	try {
		const { tableName } = c.req.valid("param");
		const columns = await getTableColumns(tableName);
		console.log("GET /tables/:tableName/columns", columns);
		return c.json(columns);
	} catch (error) {
		console.error("GET /tables/:tableName/columns error:", error);
		return handleConnectionError(c, error, "Failed to fetch columns");
	}
});
