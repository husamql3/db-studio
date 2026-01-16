import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type Sort, tableDataQuerySchema, tableNameParamSchema } from "shared/types";
import { getTableData } from "@/dao/tables-data.dao.js";
import { handleConnectionError } from "@/utils/error-handler.js";

export const dataRoutes = new Hono();

/**
 * GET /data - Get paginated data for a table
 */
dataRoutes.get(
	"/",
	zValidator("param", tableNameParamSchema),
	zValidator("query", tableDataQuerySchema),
	async (c) => {
		try {
			const { tableName } = c.req.valid("param");
			const { page, pageSize, sort: sortParam, order, filters } = c.req.valid("query");

			// Parse sort - can be either a string (legacy) or JSON array (new format)
			let sort: Sort[] | string = "";
			if (sortParam) {
				try {
					// Try to parse as JSON first (new format)
					const parsed = JSON.parse(sortParam);
					if (Array.isArray(parsed)) {
						sort = parsed;
					} else {
						sort = sortParam;
					}
				} catch {
					// If JSON parse fails, use as string (legacy format)
					sort = sortParam;
				}
			}

			const database = c.req.query("database");
			const data = await getTableData(
				tableName,
				page,
				pageSize,
				sort,
				order,
				filters,
				database,
			);
			return c.json(data);
		} catch (error) {
			console.error("GET /data error:", error);
			return handleConnectionError(c, error, "Failed to fetch table data");
		}
	},
);
