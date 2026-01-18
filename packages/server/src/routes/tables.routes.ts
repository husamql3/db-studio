import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	createTableSchema,
	databaseQuerySchema,
	deleteColumnParamSchema,
	deleteColumnQuerySchema,
	type Sort,
	tableDataQuerySchema,
	tableNameParamSchema,
} from "shared/types";
import { createTable } from "@/dao/create-table.dao.js";
import { deleteColumn } from "@/dao/delete-column.dao.js";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { getTablesList } from "@/dao/table-list.dao.js";
import { getTableData } from "@/dao/tables-data.dao.js";
import { handleConnectionError } from "@/utils/error-handler.js";

export const tablesRoutes = new Hono();

/**
 * GET /tables - Get all tables
 */
tablesRoutes.get("/", zValidator("query", databaseQuerySchema), async (c) => {
	try {
		const { database } = c.req.valid("query");
		const tablesList = await getTablesList(database);

		return c.json(tablesList);
	} catch (error) {
		return handleConnectionError(c, error, "Failed to fetch tables");
	}
});

/**
 * POST /tables - Create a new table
 */
tablesRoutes.post(
	"/",
	zValidator("json", createTableSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const body = c.req.valid("json");
			const { database } = c.req.valid("query");
			const data = await createTable(body, database);
			return c.json(data);
		} catch (error) {
			const errorDetail =
				error && typeof error === "object" && "detail" in error
					? (error as { detail?: string }).detail
					: undefined;
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Failed to create table",
					detail: errorDetail,
				},
				500,
			);
		}
	},
);

/**
 * DELETE /tables/:tableName/columns/:columnName - Delete a column from a table
 * Query params:
 *   - database: optional database name
 *   - cascade: if "true", drops dependent objects (indexes, constraints, foreign keys)
 * response: DeleteColumnResponse
 */
tablesRoutes.delete(
	"/:tableName/columns/:columnName",
	zValidator("param", deleteColumnParamSchema),
	zValidator("query", deleteColumnQuerySchema),
	async (c) => {
		try {
			const { tableName, columnName } = c.req.valid("param");
			const { database, cascade } = c.req.valid("query");

			const result = await deleteColumn(
				{ tableName, columnName, cascade },
				database,
			);
			return c.json(result);
		} catch (error) {
			return handleConnectionError(c, error, "Failed to delete column");
		}
	},
);

/**
 * GET /tables/:tableName/columns - Get all columns for a table
 */
tablesRoutes.get(
	"/:tableName/columns",
	zValidator("param", tableNameParamSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const { tableName } = c.req.valid("param");
			const { database } = c.req.valid("query");

			const columns = await getTableColumns(tableName, database);
			return c.json(columns);
		} catch (error) {
			return handleConnectionError(c, error, "Failed to fetch columns");
		}
	},
);

/**
 * GET /tables/:tableName/data - Get paginated data for a table
 */
tablesRoutes.get(
	"/:tableName/data",
	zValidator("param", tableNameParamSchema),
	zValidator("query", tableDataQuerySchema),
	async (c) => {
		try {
			const { tableName } = c.req.valid("param");
			const {
				page,
				pageSize,
				sort: sortParam,
				order,
				filters,
			} = c.req.valid("query");

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
			return handleConnectionError(c, error, "Failed to fetch table data");
		}
	},
);
