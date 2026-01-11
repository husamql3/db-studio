import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { buildDbConnectionString } from "@/db-manager.js";
import { databaseQuerySchema, tableNameParamSchema } from "@/types/create-table.type.js";
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

			// Validate database and build connection string
			// This will throw a clear error if the database is invalid or unknown
			let _connectionString: string;
			try {
				_connectionString = buildDbConnectionString(database);
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: `Invalid database: ${database || "unspecified"}`;
				console.error("Database validation error:", errorMessage);
				return c.json({ error: errorMessage }, 400);
			}

			// Pass the validated database to getTableColumns
			// getTableColumns will use it to get the correct pool via getDbPool
			const columns = await getTableColumns(tableName, database);
			console.log("GET /tables/:tableName/columns", columns);
			return c.json(columns);
		} catch (error) {
			console.error("GET /tables/:tableName/columns error:", error);
			return handleConnectionError(c, error, "Failed to fetch columns");
		}
	},
);
