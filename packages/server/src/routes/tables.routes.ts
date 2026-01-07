import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createTable } from "@/dao/create-table.dao.js";
import { getTablesList } from "@/dao/table-list.dao.js";
import { createTableSchema } from "@/types/create-table.type.js";
import { handleConnectionError } from "@/utils/error-handler.js";

export const tablesRoutes = new Hono();

/**
 * GET /tables - Get all tables
 */
tablesRoutes.get("/", async (c) => {
	try {
		const tablesList = await getTablesList();
		console.log("GET /tables", tablesList);
		return c.json(tablesList);
	} catch (error) {
		console.error("GET /tables error:", error);
		return handleConnectionError(c, error, "Failed to fetch tables");
	}
});

/**
 * POST /tables - Create a new table
 */
tablesRoutes.post("/", zValidator("json", createTableSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		console.log("POST /tables body", body);
		const data = await createTable(body);
		console.log("POST /tables", data);
		return c.json(data);
	} catch (error) {
		console.error("POST /tables error:", error);
		const errorDetail =
			error && typeof error === "object" && "detail" in error
				? (error as { detail?: string }).detail
				: undefined;
		return c.json(
			{
				success: false,
				message: error instanceof Error ? error.message : "Failed to create table",
				detail: errorDetail,
			},
			500,
		);
	}
});
