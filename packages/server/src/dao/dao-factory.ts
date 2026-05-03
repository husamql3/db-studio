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
} as const;

export type DaoMethods = typeof daoRegistry.mongodb;

/**
 * Get the DAO implementation for the specified database type
 * @param dbType - The database type (pg, mysql, mssql, mongodb)
 * @returns DAO methods for the specified database type
 */
export function getDaoFactory(dbType: DatabaseTypeSchema): DaoMethods {
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
