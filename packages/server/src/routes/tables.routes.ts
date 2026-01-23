import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { TableInfo } from "shared/types";
import { databaseSchema, type TableDataResultSchemaType } from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { createTable } from "@/dao/create-table.dao.js";
import { deleteColumn } from "@/dao/delete-column.dao.js";
import { getTableColumns } from "@/dao/table-columns.dao.js";
import { getTablesList } from "@/dao/table-list.dao.js";
import type { ColumnInfoSchemaType } from "@/dao/table-list.types.js";
import {
	createTableSchema,
	deleteColumnParamSchema,
	deleteColumnQuerySchema,
	tableDataQuerySchema,
	tableNameSchema,
} from "@/dao/table-list.types.js";
import { getTableData } from "@/dao/tables-data.dao.js";

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
		async (c): ApiHandler<TableInfo[]> => {
			const { database } = c.req.valid("query");
			const tablesList = await getTablesList(database);

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
		async (c): ApiHandler<{ message: string }> => {
			const { database } = c.req.valid("query");
			const body = c.req.valid("json");
			await createTable({ tableData: body, database });

			return c.json(
				{ message: `Table ${body.tableName} created successfully` },
				200,
			);
		},
	)

	/**
	 * DELETE /tables/:tableName/columns/:columnName
	 * Deletes a column from a table
	 * @param {DeleteColumnQuerySchemaType} query - The query parameters
	 * @param {DeleteColumnParamSchemaType} param - The URL parameters
	 * @returns {DeleteColumnResponseType} The response
	 */
	.delete(
		"/:tableName/columns/:columnName",
		zValidator("query", deleteColumnQuerySchema),
		zValidator("param", deleteColumnParamSchema),
		async (c): ApiHandler<{ message: string }> => {
			const { database, cascade } = c.req.valid("query");
			const { tableName, columnName } = c.req.valid("param");
			const { deletedCount } = await deleteColumn({
				tableName,
				columnName,
				cascade,
				database,
			});
			return c.json(
				{
					message: `Column "${columnName}" deleted successfully from table "${tableName}" with ${deletedCount} rows deleted`,
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
			const { tableName } = c.req.valid("param");
			const { database } = c.req.valid("query");
			const columns = await getTableColumns({ tableName, database });
			return c.json({ data: columns }, 200);
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
			const { cursor, limit, direction, sort, order, filters, database } =
				c.req.valid("query");

			const tableData = await getTableData({
				tableName,
				cursor,
				limit,
				direction,
				sort,
				order,
				filters,
				database,
			});
			return c.json({ data: tableData }, 200);
		},
	);

export type TablesRoutes = typeof tablesRoutes.routes;
