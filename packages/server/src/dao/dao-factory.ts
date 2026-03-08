import type { DatabaseTypeSchema } from "shared/types/database.types.js";

// PostgreSQL DAOs
import * as pgAddRecord from "./add-record.dao.js";
import * as pgBulkInsertRecords from "./bulk-insert-records.dao.js";
import * as pgCreateTable from "./create-table.dao.js";
import * as pgDatabaseList from "./database-list.dao.js";
import * as pgDeleteColumn from "./delete-column.dao.js";
import * as pgDeleteRecords from "./delete-records.dao.js";
import * as pgDeleteTable from "./delete-table.dao.js";
import * as pgExportTable from "./export-table.dao.js";
// MSSQL DAOs
import * as mssqlAddRecord from "./mssql/add-record.mssql.dao.js";
import * as mssqlBulkInsertRecords from "./mssql/bulk-insert-records.mssql.dao.js";
import * as mssqlCreateTable from "./mssql/create-table.mssql.dao.js";
import * as mssqlDatabaseList from "./mssql/database-list.mssql.dao.js";
import * as mssqlDeleteColumn from "./mssql/delete-column.mssql.dao.js";
import * as mssqlDeleteRecords from "./mssql/delete-records.mssql.dao.js";
import * as mssqlDeleteTable from "./mssql/delete-table.mssql.dao.js";
import * as mssqlExportTable from "./mssql/export-table.mssql.dao.js";
import * as mssqlQuery from "./mssql/query.mssql.dao.js";
import * as mssqlTableColumns from "./mssql/table-columns.mssql.dao.js";
import * as mssqlTableList from "./mssql/table-list.mssql.dao.js";
import * as mssqlTableSchema from "./mssql/table-schema.mssql.dao.js";
import * as mssqlTablesData from "./mssql/tables-data.mssql.dao.js";
import * as mssqlUpdateRecords from "./mssql/update-records.mssql.dao.js";
// MySQL DAOs
import * as mysqlAddRecord from "./mysql/add-record.mysql.dao.js";
import * as mysqlBulkInsertRecords from "./mysql/bulk-insert-records.mysql.dao.js";
import * as mysqlCreateTable from "./mysql/create-table.mysql.dao.js";
import * as mysqlDatabaseList from "./mysql/database-list.mysql.dao.js";
import * as mysqlDeleteColumn from "./mysql/delete-column.mysql.dao.js";
import * as mysqlDeleteRecords from "./mysql/delete-records.mysql.dao.js";
import * as mysqlDeleteTable from "./mysql/delete-table.mysql.dao.js";
import * as mysqlExportTable from "./mysql/export-table.mysql.dao.js";
import * as mysqlQuery from "./mysql/query.mysql.dao.js";
import * as mysqlTableColumns from "./mysql/table-columns.mysql.dao.js";
import * as mysqlTableList from "./mysql/table-list.mysql.dao.js";
import * as mysqlTableSchema from "./mysql/table-schema.mysql.dao.js";
import * as mysqlTablesData from "./mysql/tables-data.mysql.dao.js";
import * as mysqlUpdateRecords from "./mysql/update-records.mysql.dao.js";
import * as pgQuery from "./query.dao.js";
import * as pgTableColumns from "./table-columns.dao.js";
import * as pgTableList from "./table-list.dao.js";
import * as pgTableSchema from "./table-schema.dao.js";
import * as pgTablesData from "./tables-data.dao.js";
import * as pgUpdateRecords from "./update-records.dao.js";

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
	pg: {
		addRecord: pgAddRecord.addRecord,
		bulkInsertRecords: pgBulkInsertRecords.bulkInsertRecords,
		createTable: pgCreateTable.createTable,
		getDatabasesList: pgDatabaseList.getDatabasesList,
		getCurrentDatabase: pgDatabaseList.getCurrentDatabase,
		getDatabaseConnectionInfo: pgDatabaseList.getDatabaseConnectionInfo,
		deleteColumn: pgDeleteColumn.deleteColumn,
		deleteRecords: pgDeleteRecords.deleteRecords,
		forceDeleteRecords: pgDeleteRecords.forceDeleteRecords,
		deleteTable: pgDeleteTable.deleteTable,
		exportTableData: pgExportTable.exportTableData,
		executeQuery: pgQuery.executeQuery,
		getTableColumns: pgTableColumns.getTableColumns,
		getTablesList: pgTableList.getTablesList,
		getTableSchema: pgTableSchema.getTableSchema,
		getTableData: pgTablesData.getTableData,
		updateRecords: pgUpdateRecords.updateRecords,
	},
	mysql: {
		addRecord: mysqlAddRecord.addRecord,
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
		updateRecords: mysqlUpdateRecords.updateRecords,
	},
	mssql: {
		addRecord: mssqlAddRecord.addRecord,
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
		updateRecords: mssqlUpdateRecords.updateRecords,
	},
} as const;

export type DaoMethods = typeof daoRegistry.pg;

/**
 * Get the DAO implementation for the specified database type
 * @param dbType - The database type (pg, mysql, mssql)
 * @returns DAO methods for the specified database type
 */
export function getDaoFactory(dbType: DatabaseTypeSchema): DaoMethods {
	return daoRegistry[dbType];
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
