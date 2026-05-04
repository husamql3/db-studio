import {
	addColumnSchema,
	alterColumnSchema,
	type ColumnInfoSchemaType,
	createTableSchema,
	type DeleteTableResult,
	databaseSchema,
	deleteColumnParamSchema,
	deleteColumnQuerySchema,
	deleteTableQuerySchema,
	exportTableSchema,
	renameColumnSchema,
	type TableDataResultSchemaType,
	type TableInfoSchemaType,
	type TableSchemaResult,
	tableDataQuerySchema,
	tableNameSchema,
} from "@db-studio/shared/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getAdapter } from "@/adapters/adapter.registry.js";
import type { ApiHandler, RouteEnv } from "@/app.types.js";
import { getExportFile } from "@/utils/get-export-file.js";

export const tablesRoutes = new Hono<RouteEnv>()
	/**
	 * Base path for the endpoints, /:dbType/tables/...
	 */
	.basePath("/tables")

	/**
	 * GET /tables
	 * Returns list of all tables in the currently connected database
	 */
	.get(
		"/",
		zValidator("query", databaseSchema),
		async (c): ApiHandler<TableInfoSchemaType[]> => {
			const { db } = c.req.valid("query");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const tablesList = await dao.getTablesList(db);
			return c.json({ data: tablesList }, 200);
		},
	)

	/**
	 * POST /tables
	 * Creates a new table in the currently connected database
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", createTableSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const body = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			await dao.createTable({ tableData: body, db });
			return c.json({ data: `Table ${body.tableName} created successfully` }, 200);
		},
	)

	/**
	 * DELETE /tables/:tableName
	 * Deletes a table from the database
	 */
	.delete(
		"/:tableName",
		zValidator("query", deleteTableQuerySchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<DeleteTableResult> => {
			const { db, cascade } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const result = await dao.deleteTable({ tableName, db, cascade });
			return c.json({ data: result }, 200);
		},
	)

	/**
	 * DELETE /tables/:tableName/columns/:columnName
	 * Deletes a column from a table
	 */
	.delete(
		"/:tableName/columns/:columnName",
		zValidator("query", deleteColumnQuerySchema),
		zValidator("param", deleteColumnParamSchema),
		async (c): ApiHandler<string> => {
			const { db, cascade } = c.req.valid("query");
			const { tableName, columnName } = c.req.valid("param");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const { deletedCount } = await dao.deleteColumn({ tableName, columnName, cascade, db });
			return c.json(
				{
					data: `Column "${columnName}" deleted successfully from table "${tableName}" with ${deletedCount} rows deleted`,
				},
				200,
			);
		},
	)

	/**
	 * POST /tables/:tableName/columns
	 * Adds a column to a table
	 */
	.post(
		"/:tableName/columns",
		zValidator("query", databaseSchema),
		zValidator("param", tableNameSchema),
		zValidator("json", addColumnSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const body = c.req.valid("json");
			const dbType = c.get("dbType");

			const dao = getAdapter(dbType);
			await dao.addColumn({ tableName, db, ...body });

			return c.json(
				{
					data: `Column "${body.columnName}" added successfully to table "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * PATCH /tables/:tableName/columns/:columnName/rename
	 * Renames a column in a table
	 */
	.patch(
		"/:tableName/columns/:columnName/rename",
		zValidator("query", databaseSchema),
		zValidator("param", deleteColumnParamSchema),
		zValidator("json", renameColumnSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, columnName } = c.req.valid("param");
			const body = c.req.valid("json");
			const dbType = c.get("dbType");

			const dao = getAdapter(dbType);
			await dao.renameColumn({ tableName, columnName, db, ...body });

			return c.json(
				{
					data: `Column "${columnName}" renamed to "${body.newColumnName}" in table "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * PATCH /tables/:tableName/columns/:columnName
	 * Alters a column in a table
	 */
	.patch(
		"/:tableName/columns/:columnName",
		zValidator("query", databaseSchema),
		zValidator("param", deleteColumnParamSchema),
		zValidator("json", alterColumnSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, columnName } = c.req.valid("param");
			const body = c.req.valid("json");
			const dbType = c.get("dbType");

			const dao = getAdapter(dbType);
			await dao.alterColumn({ tableName, columnName, db, ...body });

			return c.json(
				{
					data: `Column "${columnName}" updated successfully in table "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * GET /tables/:tableName/columns
	 * Returns list of all columns in a table
	 */
	.get(
		"/:tableName/columns",
		zValidator("query", databaseSchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<ColumnInfoSchemaType[]> => {
			const { db } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const columns = await dao.getTableColumns({ tableName, db });
			return c.json({ data: columns }, 200);
		},
	)

	/**
	 * GET /tables/:tableName/schema
	 * Returns the CREATE TABLE schema for a table
	 */
	.get(
		"/:tableName/schema",
		zValidator("query", databaseSchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<TableSchemaResult> => {
			const { db } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const schema = await dao.getTableSchema({ tableName, db });
			return c.json({ data: { schema } }, 200);
		},
	)

	/**
	 * GET /tables/:tableName/data
	 * Get cursor-paginated data for a table
	 */
	.get(
		"/:tableName/data",
		zValidator("param", tableNameSchema),
		zValidator("query", tableDataQuerySchema),
		async (c): ApiHandler<TableDataResultSchemaType> => {
			const { tableName } = c.req.valid("param");
			const { cursor, limit, direction, sort, order, filters, db } = c.req.valid("query");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);
			const tableData = await dao.getTableData({
				tableName,
				cursor,
				limit,
				direction,
				sort,
				order,
				filters,
				db,
			});
			return c.json({ data: tableData }, 200);
		},
	)

	/**
	 * GET /tables/:tableName/export
	 * Export table data to CSV or XLSX format
	 */
	.get(
		"/:tableName/export",
		zValidator("param", tableNameSchema),
		zValidator("query", exportTableSchema),
		async (c) => {
			const { tableName } = c.req.valid("param");
			const { db, format } = c.req.valid("query");
			const dbType = c.get("dbType");
			const dao = getAdapter(dbType);

			const { cols, rows } = await dao.exportTableData({ tableName, db });
			const fileContent = getExportFile({ cols, rows, format, tableName });
			let contentType: string | undefined;

			switch (format) {
				case "csv":
					contentType = "text/csv";
					break;
				case "xlsx":
					contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
					break;
				case "json":
					contentType = "application/json";
					break;
			}

			return new Response(fileContent, {
				headers: {
					"Content-Type": contentType ?? "",
					"Content-Disposition": `attachment; filename="${tableName}_export.${format}"`,
				},
			});
		},
	);

export type TablesRoutes = typeof tablesRoutes.routes;
