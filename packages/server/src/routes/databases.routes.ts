import { Hono } from "hono";
import type {
	ConnectionInfoSchemaType,
	CurrentDatabaseSchemaType,
	DatabaseListSchemaType,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import {
	getCurrentDatabase as pgGetCurrentDatabase,
	getDatabaseConnectionInfo as pgGetDatabaseConnectionInfo,
	getDatabasesList as pgGetDatabasesList,
} from "@/dao/database-list.dao.js";
import {
	getCurrentDatabase as mysqlGetCurrentDatabase,
	getDatabaseConnectionInfo as mysqlGetDatabaseConnectionInfo,
	getDatabasesList as mysqlGetDatabasesList,
} from "@/dao/mysql/database-list.mysql.dao.js";
import { getDbType } from "@/db-manager.js";

/**
 * /databases routes (at root level, no dbType required)
 * GET /databases - Get list of all databases on the server (name, size, owner, encoding)
 * GET /databases/current - Get the name of the database we are currently connected to
 * GET /databases/connection - Get connection details and server information
 */
export const databasesRoutes = new Hono()
	/**
	 * Base path for the endpoints, /databases/...
	 */
	.basePath("/databases")

	/**
	 * GET /databases
	 * Returns list of all databases on the server (name, size, owner, encoding) and the database type
	 */
	.get("/", async (c): ApiHandler<DatabaseListSchemaType> => {
		const dbType = getDbType();
		const databases =
			dbType === "mysql" ? await mysqlGetDatabasesList() : await pgGetDatabasesList();
		return c.json({ data: { databases, dbType } }, 200);
	})

	/**
	 * GET /databases/current
	 * Returns the name of the database we are currently connected to and the database type
	 */
	.get("/current", async (c): ApiHandler<CurrentDatabaseSchemaType> => {
		const dbType = getDbType();
		const current =
			dbType === "mysql" ? await mysqlGetCurrentDatabase() : await pgGetCurrentDatabase();
		return c.json({ data: { db: current.db, dbType } }, 200);
	})

	/**
	 * GET /databases/connection
	 * Returns connection details and server information
	 */
	.get("/connection", async (c): ApiHandler<ConnectionInfoSchemaType> => {
		const dbType = getDbType();
		const info =
			dbType === "mysql"
				? await mysqlGetDatabaseConnectionInfo()
				: await pgGetDatabaseConnectionInfo();
		return c.json({ data: info }, 200);
	});

export type DatabasesRoutes = typeof databasesRoutes.routes;
