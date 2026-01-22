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
import { utils, write } from "xlsx";
import { z } from "zod";
import { createTable } from "@/dao/create-table.dao.js";
import { deleteColumn } from "@/dao/delete-column.dao.js";
import { exportTableData } from "@/dao/export-table.dao.js";
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
				database,
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

/**
 * GET /tables/:tableName/export - Export table data to CSV or Excel
 * Query params:
 *   - format: "csv" or "excel" (required)
 *   - sort: optional sort column or JSON array of Sort objects
 *   - order: optional sort order (asc/desc)
 *   - filters: optional JSON array of filters
 *   - database: optional database name
 */
tablesRoutes.get(
	"/:tableName/export",
	zValidator("param", tableNameParamSchema),
	zValidator(
		"query",
		tableDataQuerySchema.extend({
			format: z.enum(["csv", "excel"]),
		}),
	),
	async (c) => {
		try {
			const { tableName } = c.req.valid("param");
			const {
				format,
				sort: sortParam,
				order,
				filters,
				database,
			} = c.req.valid("query");

			// Parse sort - can be either a string (legacy) or JSON array (new format)
			let sort: Sort[] | string = "";
			if (sortParam) {
				try {
					const parsed = JSON.parse(sortParam);
					if (Array.isArray(parsed)) {
						sort = parsed;
					} else {
						sort = sortParam;
					}
				} catch {
					sort = sortParam;
				}
			}

			// Fetch all table data (without pagination)
			const data = await exportTableData(
				tableName,
				sort,
				order,
				filters,
				database,
			);

			if (data.length === 0) {
				return c.json({ error: "No data to export" }, 400);
			}

			// Get column names from the first row
			const columns = Object.keys(data[0]);

			if (format === "csv") {
				// Generate CSV
				const csvHeader = columns.join(",");
				const csvRows = data.map((row) => {
					return columns
						.map((col) => {
							const value = row[col];
							if (value === null || value === undefined) return "";
							const stringValue = String(value);
							// Escape quotes and wrap in quotes if contains comma, newline, or quote
							if (
								stringValue.includes(",") ||
								stringValue.includes("\n") ||
								stringValue.includes('"')
							) {
								return `"${stringValue.replace(/"/g, '""')}"`;
							}
							return stringValue;
						})
						.join(",");
				});
				const csv = [csvHeader, ...csvRows].join("\n");

				// Set headers for CSV download
				c.header("Content-Type", "text/csv");
				c.header(
					"Content-Disposition",
					`attachment; filename="${tableName}_export.csv"`,
				);
				return c.body(csv);
			}

			// Generate Excel
			const worksheetData = [
				columns, // Header row
				...data.map((row) => columns.map((col) => row[col] ?? "")),
			];

			const worksheet = utils.aoa_to_sheet(worksheetData);
			const workbook = utils.book_new();
			utils.book_append_sheet(workbook, worksheet, tableName);

			// Generate buffer
			const buffer = write(workbook, {
				type: "buffer",
				bookType: "xlsx",
			});

			// Set headers for Excel download
			c.header(
				"Content-Type",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			);
			c.header(
				"Content-Disposition",
				`attachment; filename="${tableName}_export.xlsx"`,
			);
			return c.body(buffer);
		} catch (error) {
			return handleConnectionError(c, error, "Failed to export table data");
		}
	},
);
