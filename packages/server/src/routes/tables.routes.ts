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
	tableQuerySchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin, requireCapability } from "@/routes/adapter.plugin.js";
import { getExportFile } from "@/routes/get-export-file.js";
import { tablesWithColumns } from "@/routes/tables-with-columns.js";

const EXPORT_CONTENT_TYPES = {
	csv: "text/csv",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	json: "application/json",
} as const;

/**
 * A header value must be Latin-1, and a raw `"` ends the quoted name, so the name goes in twice
 * (RFC 6266): an ASCII stand-in for old clients, then the exact name percent-encoded as UTF-8.
 */
const attachment = (filename: string) => {
	const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");

	const utf8 = encodeURIComponent(filename).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);

	return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
};

export const tablesRoutes = new Elysia({ prefix: "/tables" })
	.use(adapterPlugin)

	.get("/", async ({ adapter, query }) => ({ data: await adapter.getTablesList(query.db) }), {
		query: databaseSchema,
	})

	// Every table with its columns, so the visualizer draws the schema in one request.
	.get(
		"/graph",
		async ({ adapter, query: { db } }) => ({ data: await tablesWithColumns(adapter, db) }),
		{
			query: databaseSchema,
		},
	)

	.post(
		"/",
		async ({ adapter, dbType, query, body }) => {
			requireCapability(dbType, "schemaMutation");
			await adapter.createTable({ tableData: body, db: query.db });

			return { data: `Table ${body.tableName} created successfully` };
		},
		{ query: databaseSchema, body: createTableSchema },
	)

	.delete(
		"/:tableName",
		async ({ adapter, dbType, query: { db, schemaName, cascade }, params: { tableName } }) => {
			requireCapability(dbType, "schemaMutation");

			return { data: await adapter.deleteTable({ tableName, schemaName, db, cascade }) };
		},
		{ query: deleteTableQuerySchema, params: tableNameSchema },
	)

	.patch(
		"/:tableName/rename",
		async ({ adapter, dbType, query: { db, schemaName }, params: { tableName }, body }) => {
			requireCapability(dbType, "schemaMutation");
			await adapter.renameTable({ tableName, schemaName, db, ...body });

			return { data: `Table "${tableName}" renamed to "${body.newTableName}"` };
		},
		{ query: tableQuerySchema, params: tableNameSchema, body: renameTableSchema },
	)

	.delete(
		"/:tableName/columns/:columnName",
		async ({
			adapter,
			dbType,
			query: { db, schemaName, cascade },
			params: { tableName, columnName },
		}) => {
			requireCapability(dbType, "schemaMutation");

			const { deletedCount } = await adapter.deleteColumn({
				schemaName,
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

	.post(
		"/:tableName/columns",
		async ({ adapter, dbType, query: { db, schemaName }, params: { tableName }, body }) => {
			requireCapability(dbType, "schemaMutation");
			await adapter.addColumn({ tableName, schemaName, db, ...body });

			return {
				data: `Column "${body.columnName}" added successfully to table "${tableName}"`,
			};
		},
		{ query: tableQuerySchema, params: tableNameSchema, body: addColumnSchema },
	)

	.patch(
		"/:tableName/columns/:columnName/rename",
		async ({
			adapter,
			query: { db, schemaName },
			params: { tableName, columnName },
			body,
			dbType,
		}) => {
			requireCapability(dbType, "schemaMutation");
			await adapter.renameColumn({ tableName, schemaName, columnName, db, ...body });

			return {
				data: `Column "${columnName}" renamed to "${body.newColumnName}" in table "${tableName}"`,
			};
		},
		{ query: tableQuerySchema, params: deleteColumnParamSchema, body: renameColumnSchema },
	)

	.patch(
		"/:tableName/columns/:columnName",
		async ({
			adapter,
			query: { db, schemaName },
			params: { tableName, columnName },
			body,
			dbType,
		}) => {
			requireCapability(dbType, "schemaMutation");
			await adapter.alterColumn({ tableName, schemaName, columnName, db, ...body });

			return {
				data: `Column "${columnName}" updated successfully in table "${tableName}"`,
			};
		},
		{ query: tableQuerySchema, params: deleteColumnParamSchema, body: alterColumnSchema },
	)

	.get(
		"/:tableName/columns",
		async ({ adapter, query: { db, schemaName }, params: { tableName } }) => ({
			data: await adapter.getTableColumns({ tableName, schemaName, db }),
		}),
		{ query: tableQuerySchema, params: tableNameSchema },
	)

	.get(
		"/:tableName/indexes",
		async ({ adapter, dbType, query: { db, schemaName }, params: { tableName } }) => {
			requireCapability(dbType, "indexes");

			return { data: await adapter.getTableIndexes({ tableName, schemaName, db }) };
		},
		{ query: tableQuerySchema, params: tableNameSchema },
	)

	.post(
		"/:tableName/indexes",
		async ({ adapter, dbType, query: { db, schemaName }, params: { tableName }, body }) => {
			requireCapability(dbType, "indexes");
			await adapter.createIndex({ tableName, schemaName, db, ...body });

			return {
				data: `Index "${body.indexName}" created successfully on table "${tableName}"`,
			};
		},
		{ query: tableQuerySchema, params: tableNameSchema, body: createIndexSchema },
	)

	.delete(
		"/:tableName/indexes/:indexName",
		async ({
			adapter,
			dbType,
			query: { db, schemaName },
			params: { tableName, indexName },
		}) => {
			requireCapability(dbType, "indexes");
			await adapter.dropIndex({ tableName, schemaName, indexName, db });

			return {
				data: `Index "${indexName}" dropped successfully from table "${tableName}"`,
			};
		},
		{ query: tableQuerySchema, params: dropIndexParamSchema },
	)

	.get(
		"/:tableName/schema",
		async ({ adapter, query: { db, schemaName }, params: { tableName } }) => ({
			data: { schema: await adapter.getTableSchema({ tableName, schemaName, db }) },
		}),
		{ query: tableQuerySchema, params: tableNameSchema },
	)

	.get(
		"/:tableName/data",
		async ({ adapter, query, params: { tableName } }) => ({
			data: await adapter.getTableData({ tableName, ...query }),
		}),
		{ query: tableDataQuerySchema, params: tableNameSchema },
	)

	.get(
		"/:tableName/export",
		async ({ adapter, query: { db, schemaName, format }, params: { tableName } }) => {
			const { cols, rows } = await adapter.exportTableData({ tableName, schemaName, db });

			return new Response(await getExportFile({ cols, rows, format, tableName }), {
				headers: {
					"Content-Type": EXPORT_CONTENT_TYPES[format],
					"Content-Disposition": attachment(`${tableName}_export.${format}`),
				},
			});
		},
		{ query: exportTableSchema, params: tableNameSchema },
	);
