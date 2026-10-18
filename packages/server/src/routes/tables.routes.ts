import {
	addColumnSchema,
	alterColumnSchema,
	createIndexSchema,
	createTableSchema,
	databaseSchema,
	deleteColumnParamSchema,
	deleteColumnQuerySchema,
	deleteTableQuerySchema,
	dropIndexParamSchema,
	exportTableSchema,
	renameColumnSchema,
	renameTableSchema,
	tableDataQuerySchema,
	tableNameSchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";
import { getExportFile } from "@/utils/get-export-file.js";

const EXPORT_CONTENT_TYPES = {
	csv: "text/csv",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	json: "application/json",
} as const;

export const tablesRoutes = new Elysia({ prefix: "/tables" })
	.use(adapterPlugin)

	/**
	 * GET /tables
	 * Returns list of all tables in the currently connected database
	 */
	.get("/", async ({ adapter, query }) => ({ data: await adapter.getTablesList(query.db) }), {
		query: databaseSchema,
	})

	/**
	 * GET /tables/graph
	 * Returns every table with its columns, so the visualizer draws the schema in one request
	 */
	.get(
		"/graph",
		async ({ adapter, query: { db } }) => {
			const tables = await adapter.getTablesList(db);
			return {
				data: await Promise.all(
					tables.map(async (table) => ({
						...table,
						columns: await adapter.getTableColumns({ tableName: table.tableName, db }),
					})),
				),
			};
		},
		{ query: databaseSchema },
	)

	/**
	 * POST /tables
	 * Creates a new table in the currently connected database
	 */
	.post(
		"/",
		async ({ adapter, query, body }) => {
			await adapter.createTable({ tableData: body, db: query.db });
			return { data: `Table ${body.tableName} created successfully` };
		},
		{ query: databaseSchema, body: createTableSchema },
	)

	/**
	 * DELETE /tables/:tableName
	 * Deletes a table from the database
	 */
	.delete(
		"/:tableName",
		async ({ adapter, query: { db, cascade }, params: { tableName } }) => ({
			data: await adapter.deleteTable({ tableName, db, cascade }),
		}),
		{ query: deleteTableQuerySchema, params: tableNameSchema },
	)

	/**
	 * PATCH /tables/:tableName/rename
	 * Renames a table
	 */
	.patch(
		"/:tableName/rename",
		async ({ adapter, query: { db }, params: { tableName }, body }) => {
			await adapter.renameTable({ tableName, db, ...body });
			return { data: `Table "${tableName}" renamed to "${body.newTableName}"` };
		},
		{ query: databaseSchema, params: tableNameSchema, body: renameTableSchema },
	)

	/**
	 * DELETE /tables/:tableName/columns/:columnName
	 * Deletes a column from a table
	 */
	.delete(
		"/:tableName/columns/:columnName",
		async ({ adapter, query: { db, cascade }, params: { tableName, columnName } }) => {
			const { deletedCount } = await adapter.deleteColumn({
				tableName,
				columnName,
				cascade,
				db,
			});
			return {
				data: `Column "${columnName}" deleted successfully from table "${tableName}" with ${deletedCount} rows deleted`,
			};
		},
		{ query: deleteColumnQuerySchema, params: deleteColumnParamSchema },
	)

	/**
	 * POST /tables/:tableName/columns
	 * Adds a column to a table
	 */
	.post(
		"/:tableName/columns",
		async ({ adapter, query: { db }, params: { tableName }, body }) => {
			await adapter.addColumn({ tableName, db, ...body });
			return {
				data: `Column "${body.columnName}" added successfully to table "${tableName}"`,
			};
		},
		{ query: databaseSchema, params: tableNameSchema, body: addColumnSchema },
	)

	/**
	 * PATCH /tables/:tableName/columns/:columnName/rename
	 * Renames a column in a table
	 */
	.patch(
		"/:tableName/columns/:columnName/rename",
		async ({ adapter, query: { db }, params: { tableName, columnName }, body }) => {
			await adapter.renameColumn({ tableName, columnName, db, ...body });
			return {
				data: `Column "${columnName}" renamed to "${body.newColumnName}" in table "${tableName}"`,
			};
		},
		{ query: databaseSchema, params: deleteColumnParamSchema, body: renameColumnSchema },
	)

	/**
	 * PATCH /tables/:tableName/columns/:columnName
	 * Alters a column in a table
	 */
	.patch(
		"/:tableName/columns/:columnName",
		async ({ adapter, query: { db }, params: { tableName, columnName }, body }) => {
			await adapter.alterColumn({ tableName, columnName, db, ...body });
			return {
				data: `Column "${columnName}" updated successfully in table "${tableName}"`,
			};
		},
		{ query: databaseSchema, params: deleteColumnParamSchema, body: alterColumnSchema },
	)

	/**
	 * GET /tables/:tableName/columns
	 * Returns list of all columns in a table
	 */
	.get(
		"/:tableName/columns",
		async ({ adapter, query: { db }, params: { tableName } }) => ({
			data: await adapter.getTableColumns({ tableName, db }),
		}),
		{ query: databaseSchema, params: tableNameSchema },
	)

	/**
	 * GET /tables/:tableName/indexes
	 * Returns list of all indexes on a table
	 */
	.get(
		"/:tableName/indexes",
		async ({ adapter, query: { db }, params: { tableName } }) => ({
			data: await adapter.getTableIndexes({ tableName, db }),
		}),
		{ query: databaseSchema, params: tableNameSchema },
	)

	/**
	 * POST /tables/:tableName/indexes
	 * Creates an index on a table
	 */
	.post(
		"/:tableName/indexes",
		async ({ adapter, query: { db }, params: { tableName }, body }) => {
			await adapter.createIndex({ tableName, db, ...body });
			return {
				data: `Index "${body.indexName}" created successfully on table "${tableName}"`,
			};
		},
		{ query: databaseSchema, params: tableNameSchema, body: createIndexSchema },
	)

	/**
	 * DELETE /tables/:tableName/indexes/:indexName
	 * Drops an index from a table
	 */
	.delete(
		"/:tableName/indexes/:indexName",
		async ({ adapter, query: { db }, params: { tableName, indexName } }) => {
			await adapter.dropIndex({ tableName, indexName, db });
			return {
				data: `Index "${indexName}" dropped successfully from table "${tableName}"`,
			};
		},
		{ query: databaseSchema, params: dropIndexParamSchema },
	)

	/**
	 * GET /tables/:tableName/schema
	 * Returns the CREATE TABLE schema for a table
	 */
	.get(
		"/:tableName/schema",
		async ({ adapter, query: { db }, params: { tableName } }) => ({
			data: { schema: await adapter.getTableSchema({ tableName, db }) },
		}),
		{ query: databaseSchema, params: tableNameSchema },
	)

	/**
	 * GET /tables/:tableName/data
	 * Get cursor-paginated data for a table
	 */
	.get(
		"/:tableName/data",
		async ({ adapter, query, params: { tableName } }) => ({
			data: await adapter.getTableData({ tableName, ...query }),
		}),
		{ query: tableDataQuerySchema, params: tableNameSchema },
	)

	/**
	 * GET /tables/:tableName/export
	 * Export table data to CSV or XLSX format
	 */
	.get(
		"/:tableName/export",
		async ({ adapter, query: { db, format }, params: { tableName } }) => {
			const { cols, rows } = await adapter.exportTableData({ tableName, db });
			return new Response(await getExportFile({ cols, rows, format, tableName }), {
				headers: {
					"Content-Type": EXPORT_CONTENT_TYPES[format],
					"Content-Disposition": `attachment; filename="${tableName}_export.${format}"`,
				},
			});
		},
		{ query: exportTableSchema, params: tableNameSchema },
	);
