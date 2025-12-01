import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createTable } from "./dao/create-table.dao.js";
import { getTableColumns } from "./dao/table-columns.dao.js";
import { getTablesList } from "./dao/table-list.dao.js";
import { getTableData } from "./dao/tables-data.dao.js";

const app = new Hono();

// Add CORS middleware
app.use("/*", cors());
app.use("/*", logger());

/**
 * Tables
 * GET /tables - Get all tables
 */
app.get("/tables", async (c) => {
	const tablesList = await getTablesList();
	console.log("GET /tables", tablesList);
	return c.json(tablesList);
});

/**
 * Columns
 * GET /tables/:tableName/columns - Get all columns for a table
 */
app.get("/tables/:tableName/columns", async (c) => {
	const tableName = c.req.param("tableName");
	const columns = await getTableColumns(tableName);
	console.log("GET /tables/:tableName/columns", columns);
	return c.json(columns);
});

/**
 * Data
 * GET /tables/:tableName/data - Get paginated data for a table
 * Query params: page (default: 1), pageSize (default: 50)
 */
app.get("/tables/:tableName/data", async (c) => {
	const tableName = c.req.param("tableName");
	const page = Number(c.req.query("page") || "1");
	const pageSize = Number(c.req.query("pageSize") || "50");
	const data = await getTableData(tableName, page, pageSize);
	// console.log("/tables/:tableName/data", data);
	return c.json(data);
});

/**
 * Create Table
 * POST /tables - Create a new table
 */
app.post("/tables", async (c) => {
	try {
		const body = await c.req.json();
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

/**
 * Root
 * GET / - Get the root
 */
app.get("/", (c) => {
	return c.json({
		message: "Hello World",
		tables: "/tables",
		columns: "/tables/:tableName/columns",
		data: "/tables/:tableName/data",
	});
});

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
	console.error("ERROR: DATABASE_URL environment variable is not set!");
	console.error("Please create a .env file with DATABASE_URL=your_connection_string");
	process.exit(1);
}

serve(
	{
		fetch: app.fetch,
		port: 3000,
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
		console.log(
			`Database URL: ${process.env.DATABASE_URL?.split("@")[1] || "Not configured"}`,
		);
	},
);
