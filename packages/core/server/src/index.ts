import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createTable } from "./dao/create-table.dao.js";
import { deleteRecords, forceDeleteRecords } from "./dao/delete-records.dao.js";
import { insertRecord } from "./dao/insert-record.dao.js";
import { getTableColumns } from "./dao/table-columns.dao.js";
import { getTablesList } from "./dao/table-list.dao.js";
import { getTableData } from "./dao/tables-data.dao.js";
import { updateRecords } from "./dao/update-records.dao.js";

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
 * Query params: page (default: 1), pageSize (default: 50), sort, order, filters (JSON)
 */
app.get("/tables/:tableName/data", async (c) => {
	const tableName = c.req.param("tableName");
	const page = Number(c.req.query("page") || "1");
	const sort = c.req.query("sort") || "";
	const order = c.req.query("order") || "asc";
	const pageSize = Number(c.req.query("pageSize") || "50");
	const filtersParam = c.req.query("filters");
	const filters = filtersParam ? JSON.parse(filtersParam) : [];
	const data = await getTableData(tableName, page, pageSize, sort, order, filters);
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
 * Create Record
 * POST /records - Insert a new record into a table
 * Body: { tableName: string, ...recordData }
 */
app.post("/records", async (c) => {
	try {
		const body = await c.req.json();
		const { tableName, ...recordData } = body;

		if (!tableName) {
			return c.json(
				{
					success: false,
					message: "tableName is required",
				},
				400,
			);
		}

		console.log("POST /records body", { tableName, recordData });
		const result = await insertRecord({ tableName, data: recordData });
		console.log("POST /records", result);
		return c.json(result);
	} catch (error) {
		console.error("POST /records error:", error);
		const errorDetail =
			error && typeof error === "object" && "detail" in error
				? (error as { detail?: string }).detail
				: undefined;
		return c.json(
			{
				success: false,
				message: error instanceof Error ? error.message : "Failed to create record",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * Update Records
 * PATCH /records - Update one or more cells in a table
 * Body: {
 *   tableName: string,
 *   updates: Array<{ rowData: Record<string, unknown>, columnName: string, value: unknown }>,
 *   primaryKey?: string (optional, defaults to 'id')
 * }
 */
app.patch("/records", async (c) => {
	try {
		const body = await c.req.json();
		const { tableName, updates, primaryKey } = body;

		if (!tableName) {
			return c.json(
				{
					success: false,
					message: "tableName is required",
				},
				400,
			);
		}

		if (!updates || !Array.isArray(updates) || updates.length === 0) {
			return c.json(
				{
					success: false,
					message: "updates array is required and must contain at least one update",
				},
				400,
			);
		}

		console.log("PATCH /records body", { tableName, updates, primaryKey });
		const result = await updateRecords({ tableName, updates, primaryKey });
		console.log("PATCH /records", result);
		return c.json(result);
	} catch (error) {
		console.error("PATCH /records error:", error);
		const errorDetail =
			error && typeof error === "object" && "detail" in error
				? (error as { detail?: string }).detail
				: undefined;
		return c.json(
			{
				success: false,
				message: error instanceof Error ? error.message : "Failed to update records",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * Delete Records
 * DELETE /records - Delete records from a table
 * Body: {
 *   tableName: string,
 *   primaryKeys: Array<{ columnName: string, value: unknown }>,
 * }
 * Returns:
 *   - success: true if deleted
 *   - fkViolation: true if FK constraint prevents deletion, includes relatedRecords
 */
app.delete("/records", async (c) => {
	try {
		const body = await c.req.json();
		const { tableName, primaryKeys } = body;

		if (!tableName) {
			return c.json(
				{
					success: false,
					message: "tableName is required",
				},
				400,
			);
		}

		if (!primaryKeys || !Array.isArray(primaryKeys) || primaryKeys.length === 0) {
			return c.json(
				{
					success: false,
					message: "primaryKeys array is required and must contain at least one key",
				},
				400,
			);
		}

		console.log("DELETE /records body", { tableName, primaryKeys });
		const result = await deleteRecords({ tableName, primaryKeys });
		console.log("DELETE /records result", result);

		// Return 409 Conflict for FK violations
		if (result.fkViolation) {
			return c.json(result, 409);
		}

		return c.json(result);
	} catch (error) {
		console.error("DELETE /records error:", error);
		const errorDetail =
			error && typeof error === "object" && "detail" in error
				? (error as { detail?: string }).detail
				: undefined;
		return c.json(
			{
				success: false,
				message: error instanceof Error ? error.message : "Failed to delete records",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * Force Delete Records (Cascade)
 * DELETE /records/force - Force delete records and all related FK records
 * Body: {
 *   tableName: string,
 *   primaryKeys: Array<{ columnName: string, value: unknown }>,
 * }
 */
app.delete("/records/force", async (c) => {
	try {
		const body = await c.req.json();
		const { tableName, primaryKeys } = body;

		if (!tableName) {
			return c.json(
				{
					success: false,
					message: "tableName is required",
				},
				400,
			);
		}

		if (!primaryKeys || !Array.isArray(primaryKeys) || primaryKeys.length === 0) {
			return c.json(
				{
					success: false,
					message: "primaryKeys array is required and must contain at least one key",
				},
				400,
			);
		}

		console.log("DELETE /records/force body", { tableName, primaryKeys });
		const result = await forceDeleteRecords({ tableName, primaryKeys });
		console.log("DELETE /records/force result", result);

		return c.json(result);
	} catch (error) {
		console.error("DELETE /records/force error:", error);
		const errorDetail =
			error && typeof error === "object" && "detail" in error
				? (error as { detail?: string }).detail
				: undefined;
		return c.json(
			{
				success: false,
				message:
					error instanceof Error ? error.message : "Failed to force delete records",
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
		records: "POST /records",
		updateRecords: "PATCH /records",
		deleteRecords: "DELETE /records",
		forceDeleteRecords: "DELETE /records/force",
	});
});

// Check if DATABASE_URL is set
// if (!process.env.DATABASE_URL) {
//   console.error("ERROR: DATABASE_URL environment variable is not set!");
//   console.error("Please create a .env file with DATABASE_URL=your_connection_string");
//   process.exit(1);
// }

// serve(
//   {
//     fetch: app.fetch,
//     port: 3000,
//   },
//   (info) => {
//     console.log(`Server is running on http://localhost:${info.port}`);
//     console.log(
//       `Database URL: ${process.env.DATABASE_URL?.split("@")[1] || "Not configured"}`,
//     );
//   },
// );

export default app;
