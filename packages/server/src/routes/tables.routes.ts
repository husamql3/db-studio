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
import type { ApiHandler } from "@/app.types.js";
import { createTable } from "@/dao/create-table.dao.js";
import { deleteColumn } from "@/dao/delete-column.dao.js";
import { deleteTable } from "@/dao/delete-table.dao.js";
import { exportTableData } from "@/dao/export-table.dao.js";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { getTablesList } from "@/dao/table-list.dao.js";
import { getTableSchema } from "@/dao/table-schema.dao.js";
import { getTableData } from "@/dao/tables-data.dao.js";
import { getExportFile } from "@/utils/get-export-file.js";

export const tablesRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/tables/...
	 */
	.basePath("/tables")

	/**
	 * GET /tables
	 * Returns list of all tables in the currently connected database
	 * @returns {Array} List of table info objects
	 */
	.get(
		"/",
		zValidator("query", databaseSchema),
		async (c): ApiHandler<TableInfoSchemaType[]> => {
			const { db } = c.req.valid("query");
			const tablesList = await getTablesList(db);
			return c.json({ data: tablesList }, 200);
		},
	)

	/**
	 * POST /tables
	 * Creates a new table in the currently connected database
	 * @param {CreateTableSchemaType} body - The data for the new table
	 * @returns {string} A success message
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", createTableSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const body = c.req.valid("json");
			await createTable({ tableData: body, db });
			return c.json({ data: `Table ${body.tableName} created successfully` }, 200);
		},
	)

	/**
	 * DELETE /tables/:tableName
	 * Deletes a table from the database
	 * @param {DeleteTableQuerySchemaType} query - The query parameters (db, cascade)
	 * @param {TableNameSchemaType} param - The URL parameters
	 * @returns {DeleteTableResult} The result with deletedCount, fkViolation flag, and relatedRecords
	 */
	.delete(
		"/:tableName",
		zValidator("query", deleteTableQuerySchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<DeleteTableResult> => {
			const { db, cascade } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const result = await deleteTable({ tableName, db, cascade });
			return c.json({ data: result }, 200);
		},
	)

	/**
	 * DELETE /tables/:tableName/columns/:columnName
	 * Deletes a column from a table
	 * @param {DatabaseSchemaType} query - The query parameters
	 * @param {DeleteColumnParamSchemaType} param - The URL parameters
	 * @returns {DeleteColumnResponseType} The response
	 */
	.delete(
		"/:tableName/columns/:columnName",
		zValidator("query", deleteColumnQuerySchema),
		zValidator("param", deleteColumnParamSchema),
		async (c): ApiHandler<string> => {
			const { db, cascade } = c.req.valid("query");
			const { tableName, columnName } = c.req.valid("param");
			const { deletedCount } = await deleteColumn({
				tableName,
				columnName,
				cascade,
				db,
			});
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
	 * @param {DatabaseSchemaType} query - The query parameters
	 * @param {TableNameSchemaType} param - The URL parameters
	 * @returns {ColumnInfoSchemaType[]} The response
	 */
	.get(
		"/:tableName/columns",
		zValidator("query", databaseSchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<ColumnInfoSchemaType[]> => {
			const { db } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const columns = await getTableColumns({ tableName, db });
			return c.json({ data: columns }, 200);
		},
	)

	/**
	 * GET /tables/:tableName/schema
	 * Returns the CREATE TABLE schema for a table
	 * @param {DatabaseSchemaType} query - The query parameters
	 * @param {TableNameSchemaType} param - The URL parameters
	 * @returns {TableSchemaResult} The CREATE TABLE SQL statement
	 */
	.get(
		"/:tableName/schema",
		zValidator("query", databaseSchema),
		zValidator("param", tableNameSchema),
		async (c): ApiHandler<TableSchemaResult> => {
			const { db } = c.req.valid("query");
			const { tableName } = c.req.valid("param");
			const schema = await getTableSchema({ tableName, db });
			return c.json({ data: { schema } }, 200);
		},
	)

	/**
	 * GET /tables/:tableName/data
	 * Get cursor-paginated data for a table
	 * @param {TableNameSchemaType} param - The URL parameters
	 * @param {TableDataQuerySchemaType} query - The query parameters
	 * @returns {TableDataResultSchemaType} The response
	 * @throws {HTTPException} If the table does not exist or the query is invalid
	 */
	.get(
		"/:tableName/data",
		zValidator("param", tableNameSchema),
		zValidator("query", tableDataQuerySchema),
		async (c): ApiHandler<TableDataResultSchemaType> => {
			const { tableName } = c.req.valid("param");
			const { cursor, limit, direction, sort, order, filters, db } = c.req.valid("query");
			const tableData = await getTableData({
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
	 * @param {TableNameSchemaType} param - The URL parameters
	 * @param {ExportTableSchemaType} query - The query parameters (db, format)
	 * @returns {BodyInit} The file content as a binary response
	 */
	.get(
		"/:tableName/export",
		zValidator("param", tableNameSchema),
		zValidator("query", exportTableSchema),
		async (c) => {
			const { tableName } = c.req.valid("param");
			const { db, format } = c.req.valid("query");

			const { cols, rows } = await exportTableData({ tableName, db });
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
