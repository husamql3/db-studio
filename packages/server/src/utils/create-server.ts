import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createTable } from "../dao/create-table.dao.js";
import { deleteRecords, forceDeleteRecords } from "../dao/delete-records.dao.js";
import { insertRecord } from "../dao/insert-record.dao.js";
import { getTableColumns } from "../dao/table-columns.dao.js";
import { getTablesList } from "../dao/table-list.dao.js";
import { getTableData, type Sort } from "../dao/tables-data.dao.js";
import { updateRecords } from "../dao/update-records.dao.js";
import {
	createTableSchema,
	deleteRecordsSchema,
	insertRecordSchema,
	tableDataQuerySchema,
	tableNameParamSchema,
	updateRecordsSchema,
} from "../types/create-table.type.js";

const getCoreDistPath = () => {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(__dirname, "./core-dist");
};

export const createServer = () => {
	const api = new Hono().basePath("/");

	// Add CORS middleware to API routes
	api.use("/*", cors());

	api.use(
		"/favicon.ico",
		serveStatic({ path: path.resolve(getCoreDistPath(), "favicon.ico") }),
	);

	api.use("*", async (c, next) => {
		c.header("Access-Control-Allow-Origin", "*");
		c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
		c.header("Access-Control-Allow-Headers", "Content-Type");
		await next();
	});

	/**
	 * Serve static files from the core dist directory
	 */
	api.use("/*", serveStatic({ root: getCoreDistPath() }));

	/**
	 * Tables
	 * GET /tables - Get all tables
	 */
	api.get("/tables", async (c) => {
		try {
			const tablesList = await getTablesList();
			console.log("GET /tables", tablesList);
			return c.json(tablesList);
		} catch (error) {
			console.error("GET /tables error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Failed to fetch tables";

			// Check for connection errors (can be in AggregateError.errors array or directly)
			let isConnectionError = false;
			if (error && typeof error === "object" && "code" in error) {
				isConnectionError = (error as { code?: string }).code === "ECONNREFUSED";
			} else if (
				error &&
				typeof error === "object" &&
				"errors" in error &&
				Array.isArray((error as { errors?: unknown[] }).errors)
			) {
				// Handle AggregateError
				const aggregateError = error as { errors?: Array<{ code?: string }> };
				isConnectionError =
					aggregateError.errors?.some((err) => err.code === "ECONNREFUSED") ?? false;
			}

			if (isConnectionError) {
				return c.json(
					{
						success: false,
						message:
							"Cannot connect to database. Please check your DATABASE_URL and ensure the database server is running.",
						error: errorMessage,
					},
					503,
				);
			}

			return c.json(
				{
					success: false,
					message: errorMessage,
				},
				500,
			);
		}
	});

	/**
	 * Columns
	 * GET /tables/:tableName/columns - Get all columns for a table
	 */
	api.get(
		"/tables/:tableName/columns",
		zValidator("param", tableNameParamSchema),
		async (c) => {
			try {
				const { tableName } = c.req.valid("param");
				const columns = await getTableColumns(tableName);
				console.log("GET /tables/:tableName/columns", columns);
				return c.json(columns);
			} catch (error) {
				console.error("GET /tables/:tableName/columns error:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Failed to fetch columns";

				// Check for connection errors (can be in AggregateError.errors array or directly)
				let isConnectionError = false;
				if (error && typeof error === "object" && "code" in error) {
					isConnectionError = (error as { code?: string }).code === "ECONNREFUSED";
				} else if (
					error &&
					typeof error === "object" &&
					"errors" in error &&
					Array.isArray((error as { errors?: unknown[] }).errors)
				) {
					// Handle AggregateError
					const aggregateError = error as { errors?: Array<{ code?: string }> };
					isConnectionError =
						aggregateError.errors?.some((err) => err.code === "ECONNREFUSED") ?? false;
				}

				if (isConnectionError) {
					return c.json(
						{
							success: false,
							message:
								"Cannot connect to database. Please check your DATABASE_URL and ensure the database server is running.",
							error: errorMessage,
						},
						503,
					);
				}

				return c.json(
					{
						success: false,
						message: errorMessage,
					},
					500,
				);
			}
		},
	);

	/**
	 * Data
	 * GET /tables/:tableName/data - Get paginated data for a table
	 * Query params: page (default: 1), pageSize (default: 50), sort (string or JSON array), order, filters (JSON)
	 */
	api.get(
		"/tables/:tableName/data",
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

				const data = await getTableData(tableName, page, pageSize, sort, order, filters);
				return c.json(data);
			} catch (error) {
				console.error("GET /tables/:tableName/data error:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Failed to fetch table data";

				// Check for connection errors (can be in AggregateError.errors array or directly)
				let isConnectionError = false;
				if (error && typeof error === "object" && "code" in error) {
					isConnectionError = (error as { code?: string }).code === "ECONNREFUSED";
				} else if (
					error &&
					typeof error === "object" &&
					"errors" in error &&
					Array.isArray((error as { errors?: unknown[] }).errors)
				) {
					// Handle AggregateError
					const aggregateError = error as { errors?: Array<{ code?: string }> };
					isConnectionError =
						aggregateError.errors?.some((err) => err.code === "ECONNREFUSED") ?? false;
				}

				if (isConnectionError) {
					return c.json(
						{
							success: false,
							message:
								"Cannot connect to database. Please check your DATABASE_URL and ensure the database server is running.",
							error: errorMessage,
						},
						503,
					);
				}

				return c.json(
					{
						success: false,
						message: errorMessage,
					},
					500,
				);
			}
		},
	);

	/**
	 * Create Table
	 * POST /tables - Create a new table
	 */
	api.post("/tables", zValidator("json", createTableSchema), async (c) => {
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

	/**
	 * Create Record
	 * POST /records - Insert a new record into a table
	 * Body: { tableName: string, ...recordData }
	 */
	api.post("/records", zValidator("json", insertRecordSchema), async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, ...recordData } = body;

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
	api.patch("/records", zValidator("json", updateRecordsSchema), async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, updates, primaryKey } = body;

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
	api.delete("/records", zValidator("json", deleteRecordsSchema), async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, primaryKeys } = body;

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
	api.delete("/records/force", zValidator("json", deleteRecordsSchema), async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, primaryKeys } = body;

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

	return api;
};
