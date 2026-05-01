import type { DatabaseTypeSchema } from "shared/types/database.types.js";
import { adapterRegistry } from "@/adapters/adapter.registry.js";

// MongoDB DAOs
import * as mongoAddColumn from "./mongo/add-column.mongo.dao.js";
import * as mongoAddRecord from "./mongo/add-record.mongo.dao.js";
import * as mongoAlterColumn from "./mongo/alter-column.mongo.dao.js";
import * as mongoBulkInsertRecords from "./mongo/bulk-insert-records.mongo.dao.js";
import * as mongoCreateTable from "./mongo/create-table.mongo.dao.js";
import * as mongoDatabaseList from "./mongo/database-list.mongo.dao.js";
import * as mongoDeleteColumn from "./mongo/delete-column.mongo.dao.js";
import * as mongoDeleteRecords from "./mongo/delete-records.mongo.dao.js";
import * as mongoDeleteTable from "./mongo/delete-table.mongo.dao.js";
import * as mongoExportTable from "./mongo/export-table.mongo.dao.js";
import * as mongoQuery from "./mongo/query.mongo.dao.js";
import * as mongoTableColumns from "./mongo/table-columns.mongo.dao.js";
import * as mongoTableList from "./mongo/table-list.mongo.dao.js";
import * as mongoTableSchema from "./mongo/table-schema.mongo.dao.js";
import * as mongoTablesData from "./mongo/tables-data.mongo.dao.js";
import * as mongoUpdateRecords from "./mongo/update-records.mongo.dao.js";
// MSSQL DAOs
import * as mssqlAddColumn from "./mssql/add-column.mssql.dao.js";
import * as mssqlAddRecord from "./mssql/add-record.mssql.dao.js";
import * as mssqlAlterColumn from "./mssql/alter-column.mssql.dao.js";
import * as mssqlBulkInsertRecords from "./mssql/bulk-insert-records.mssql.dao.js";
import * as mssqlCreateTable from "./mssql/create-table.mssql.dao.js";
import * as mssqlDatabaseList from "./mssql/database-list.mssql.dao.js";
import * as mssqlDeleteColumn from "./mssql/delete-column.mssql.dao.js";
import * as mssqlDeleteRecords from "./mssql/delete-records.mssql.dao.js";
import * as mssqlDeleteTable from "./mssql/delete-table.mssql.dao.js";
import * as mssqlExportTable from "./mssql/export-table.mssql.dao.js";
import * as mssqlQuery from "./mssql/query.mssql.dao.js";
import * as mssqlRenameColumn from "./mssql/rename-column.mssql.dao.js";
import * as mssqlTableColumns from "./mssql/table-columns.mssql.dao.js";
import * as mssqlTableList from "./mssql/table-list.mssql.dao.js";
import * as mssqlTableSchema from "./mssql/table-schema.mssql.dao.js";
import * as mssqlTablesData from "./mssql/tables-data.mssql.dao.js";
import * as mssqlUpdateRecords from "./mssql/update-records.mssql.dao.js";
// MySQL DAOs
import * as mysqlAddColumn from "./mysql/add-column.mysql.dao.js";
import * as mysqlAddRecord from "./mysql/add-record.mysql.dao.js";
import * as mysqlAlterColumn from "./mysql/alter-column.mysql.dao.js";
import * as mysqlBulkInsertRecords from "./mysql/bulk-insert-records.mysql.dao.js";
import * as mysqlCreateTable from "./mysql/create-table.mysql.dao.js";
import * as mysqlDatabaseList from "./mysql/database-list.mysql.dao.js";
import * as mysqlDeleteColumn from "./mysql/delete-column.mysql.dao.js";
import * as mysqlDeleteRecords from "./mysql/delete-records.mysql.dao.js";
import * as mysqlDeleteTable from "./mysql/delete-table.mysql.dao.js";
import * as mysqlExportTable from "./mysql/export-table.mysql.dao.js";
import * as mysqlQuery from "./mysql/query.mysql.dao.js";
import * as mysqlRenameColumn from "./mysql/rename-column.mysql.dao.js";
import * as mysqlTableColumns from "./mysql/table-columns.mysql.dao.js";
import * as mysqlTableList from "./mysql/table-list.mysql.dao.js";
import * as mysqlTableSchema from "./mysql/table-schema.mysql.dao.js";
import * as mysqlTablesData from "./mysql/tables-data.mysql.dao.js";
import * as mysqlUpdateRecords from "./mysql/update-records.mysql.dao.js";

/**
 * DAO Factory - Automatically routes to the correct database implementation
 *
 * Usage:
 * ```typescript
 * const dao = getDaoFactory(dbType);
 * const tables = await dao.getTablesList(db);
 * ```
 */
const daoRegistry = {
	mysql: {
		addColumn: mysqlAddColumn.addColumn,
		addRecord: mysqlAddRecord.addRecord,
		alterColumn: mysqlAlterColumn.alterColumn,
		bulkInsertRecords: mysqlBulkInsertRecords.bulkInsertRecords,
		createTable: mysqlCreateTable.createTable,
		getDatabasesList: mysqlDatabaseList.getDatabasesList,
		getCurrentDatabase: mysqlDatabaseList.getCurrentDatabase,
		getDatabaseConnectionInfo: mysqlDatabaseList.getDatabaseConnectionInfo,
		deleteColumn: mysqlDeleteColumn.deleteColumn,
		deleteRecords: mysqlDeleteRecords.deleteRecords,
		forceDeleteRecords: mysqlDeleteRecords.forceDeleteRecords,
		deleteTable: mysqlDeleteTable.deleteTable,
		exportTableData: mysqlExportTable.exportTableData,
		executeQuery: mysqlQuery.executeQuery,
		getTableColumns: mysqlTableColumns.getTableColumns,
		getTablesList: mysqlTableList.getTablesList,
		getTableSchema: mysqlTableSchema.getTableSchema,
		getTableData: mysqlTablesData.getTableData,
		renameColumn: mysqlRenameColumn.renameColumn,
		updateRecords: mysqlUpdateRecords.updateRecords,
	},
	mongodb: {
		addColumn: mongoAddColumn.addColumn,
		addRecord: mongoAddRecord.addRecord,
		alterColumn: mongoAlterColumn.alterColumn,
		bulkInsertRecords: mongoBulkInsertRecords.bulkInsertRecords,
		createTable: mongoCreateTable.createTable,
		getDatabasesList: mongoDatabaseList.getDatabasesList,
		getCurrentDatabase: mongoDatabaseList.getCurrentDatabase,
		getDatabaseConnectionInfo: mongoDatabaseList.getDatabaseConnectionInfo,
		deleteColumn: mongoDeleteColumn.deleteColumn,
		deleteRecords: mongoDeleteRecords.deleteRecords,
		forceDeleteRecords: mongoDeleteRecords.forceDeleteRecords,
		deleteTable: mongoDeleteTable.deleteTable,
		exportTableData: mongoExportTable.exportTableData,
		executeQuery: mongoQuery.executeQuery,
		getTableColumns: mongoTableColumns.getTableColumns,
		getTablesList: mongoTableList.getTablesList,
		getTableSchema: mongoTableSchema.getTableSchema,
		getTableData: mongoTablesData.getTableData,
		renameColumn: mongoAlterColumn.renameColumn,
		updateRecords: mongoUpdateRecords.updateRecords,
	},
	mssql: {
		addColumn: mssqlAddColumn.addColumn,
		addRecord: mssqlAddRecord.addRecord,
		alterColumn: mssqlAlterColumn.alterColumn,
		bulkInsertRecords: mssqlBulkInsertRecords.bulkInsertRecords,
		createTable: mssqlCreateTable.createTable,
		getDatabasesList: mssqlDatabaseList.getDatabasesList,
		getCurrentDatabase: mssqlDatabaseList.getCurrentDatabase,
		getDatabaseConnectionInfo: mssqlDatabaseList.getDatabaseConnectionInfo,
		deleteColumn: mssqlDeleteColumn.deleteColumn,
		deleteRecords: mssqlDeleteRecords.deleteRecords,
		forceDeleteRecords: mssqlDeleteRecords.forceDeleteRecords,
		deleteTable: mssqlDeleteTable.deleteTable,
		exportTableData: mssqlExportTable.exportTableData,
		executeQuery: mssqlQuery.executeQuery,
		getTableColumns: mssqlTableColumns.getTableColumns,
		getTablesList: mssqlTableList.getTablesList,
		getTableSchema: mssqlTableSchema.getTableSchema,
		getTableData: mssqlTablesData.getTableData,
		renameColumn: mssqlRenameColumn.renameColumn,
		updateRecords: mssqlUpdateRecords.updateRecords,
	},
} as const;

export type DaoMethods = typeof daoRegistry.mysql;

/**
 * Get the DAO implementation for the specified database type
 * @param dbType - The database type (pg, mysql, mssql, mongodb)
 * @returns DAO methods for the specified database type
 */
export function getDaoFactory(dbType: DatabaseTypeSchema): DaoMethods {
	// Prefer a registered IDbAdapter when one exists (PG and future adapters).
	// Falls back to the legacy daoRegistry for mysql, mssql, mongodb until their adapters are built.
	if (adapterRegistry.has(dbType)) {
		return adapterRegistry.get(dbType);
	}

	return daoRegistry[dbType as keyof typeof daoRegistry] as unknown as DaoMethods;
}

/**
 * Execute a DAO method with automatic database type routing
 * @param dbType - The database type
 * @param method - The DAO method name
 * @param args - Arguments to pass to the DAO method
 */
export async function executeDaoMethod<K extends keyof DaoMethods>(
	dbType: DatabaseTypeSchema,
	method: K,
	...args: Parameters<DaoMethods[K]>
): Promise<ReturnType<DaoMethods[K]>> {
	const dao = getDaoFactory(dbType);
	// @ts-expect-error - Complex type inference, but runtime safe
	return dao[method](...args);
}
