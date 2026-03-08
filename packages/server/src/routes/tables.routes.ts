import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	type ColumnInfoSchemaType,
	createTableSchema,
	type DeleteTableResult,
	databaseSchema,
	deleteColumnParamSchema,
	deleteColumnQuerySchema,
	deleteTableQuerySchema,
	exportTableSchema,
	type TableDataResultSchemaType,
	type TableInfoSchemaType,
	type TableSchemaResult,
	tableDataQuerySchema,
	tableNameSchema,
} from "shared/types";
import type { ApiHandler, RouteEnv } from "@/app.types.js";
import { getDaoFactory } from "@/dao/dao-factory.js";
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);
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
			const dao = getDaoFactory(dbType);

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
