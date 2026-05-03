import * as dbManager from "@/db-manager.js";

export const getDbPool: typeof dbManager.getDbPool = (database) =>
	dbManager.getDbPool(database);

export const getMysqlPool: typeof dbManager.getMysqlPool = (database) =>
	dbManager.getMysqlPool(database);

export const getMssqlPool: typeof dbManager.getMssqlPool = (database) =>
	dbManager.getMssqlPool(database);

export const getMongoClient: typeof dbManager.getMongoClient = () =>
	dbManager.getMongoClient();

export const getMongoDbName: typeof dbManager.getMongoDbName = () =>
	dbManager.getMongoDbName();

export const getMongoDb: typeof dbManager.getMongoDb = (dbName) =>
	dbManager.getMongoDb(dbName);
