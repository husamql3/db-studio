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
import { createTable as pgCreateTable } from "@/dao/create-table.dao.js";
import { deleteColumn as pgDeleteColumn } from "@/dao/delete-column.dao.js";
import { deleteTable as pgDeleteTable } from "@/dao/delete-table.dao.js";
import { exportTableData as pgExportTableData } from "@/dao/export-table.dao.js";
import { createTable as mysqlCreateTable } from "@/dao/mysql/create-table.mysql.dao.js";
import { deleteColumn as mysqlDeleteColumn } from "@/dao/mysql/delete-column.mysql.dao.js";
import { deleteTable as mysqlDeleteTable } from "@/dao/mysql/delete-table.mysql.dao.js";
import { exportTableData as mysqlExportTableData } from "@/dao/mysql/export-table.mysql.dao.js";
import { getTableColumns as mysqlGetTableColumns } from "@/dao/mysql/table-columns.mysql.dao.js";
import { getTablesList as mysqlGetTablesList } from "@/dao/mysql/table-list.mysql.dao.js";
import { getTableSchema as mysqlGetTableSchema } from "@/dao/mysql/table-schema.mysql.dao.js";
import { getTableData as mysqlGetTableData } from "@/dao/mysql/tables-data.mysql.dao.js";
import { getTableColumns as pgGetTableColumns } from "@/dao/table-columns.dao.js";
import { getTablesList as pgGetTablesList } from "@/dao/table-list.dao.js";
import { getTableSchema as pgGetTableSchema } from "@/dao/table-schema.dao.js";
import { getTableData as pgGetTableData } from "@/dao/tables-data.dao.js";
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
			const tablesList =
				dbType === "mysql" ? await mysqlGetTablesList(db) : await pgGetTablesList(db);
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
			if (dbType === "mysql") {
				await mysqlCreateTable({ tableData: body, db });
			} else {
				await pgCreateTable({ tableData: body, db });
			}
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
			const result =
				dbType === "mysql"
					? await mysqlDeleteTable({ tableName, db, cascade })
					: await pgDeleteTable({ tableName, db, cascade });
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
			const { deletedCount } =
				dbType === "mysql"
					? await mysqlDeleteColumn({ tableName, columnName, cascade, db })
					: await pgDeleteColumn({ tableName, columnName, cascade, db });
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
			const columns =
				dbType === "mysql"
					? await mysqlGetTableColumns({ tableName, db })
					: await pgGetTableColumns({ tableName, db });
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
			const schema =
				dbType === "mysql"
					? await mysqlGetTableSchema({ tableName, db })
					: await pgGetTableSchema({ tableName, db });
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
			const tableData =
				dbType === "mysql"
					? await mysqlGetTableData({
							tableName,
							cursor,
							limit,
							direction,
							sort,
							order,
							filters,
							db,
						})
					: await pgGetTableData({
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

			const { cols, rows } =
				dbType === "mysql"
					? await mysqlExportTableData({ tableName, db })
					: await pgExportTableData({ tableName, db });
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
