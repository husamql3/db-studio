import { Hono } from "hono";
import type {
	ConnectionInfoSchemaType,
	CurrentDatabaseSchemaType,
	DatabaseListSchemaType,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import {
	getCurrentDatabase,
	getDatabaseConnectionInfo,
	getDatabasesList,
} from "@/dao/database-list.dao.js";
import { getDbType } from "@/db-manager.js";

/**
 * /databases routes (at root level, no dbType required)
 * GET /databases - Get list of all databases on the server (name, size, owner, encoding)
 * GET /databases/current - Get the name of the database we are currently connected to
 * GET /databases/connection - Get connection details and server information (PostgreSQL version, host, port, user, current database, connection counts)
 */
export const databasesRoutes = new Hono()
	/**
	 * Base path for the endpoints, /databases/...
	 */
	.basePath("/databases")

	/**
	 * GET /databases
	 * Returns list of all databases on the server (name, size, owner, encoding) and the database type
	 * @returns {Object} Object with databases array and dbType
	 */
	.get("/", async (c): ApiHandler<DatabaseListSchemaType> => {
		const databases = await getDatabasesList();
		const dbType = getDbType();
		return c.json({ data: { databases, dbType } }, 200);
	})

	/**
	 * GET /databases/current
	 * Returns the name of the database we are currently connected to and the database type
	 * @returns {Object} Object with current database name and type
	 */
	.get("/current", async (c): ApiHandler<CurrentDatabaseSchemaType> => {
		const current = await getCurrentDatabase();
		const dbType = getDbType();
		return c.json({ data: { ...current, dbType } }, 200);
	})

	/**
	 * GET /databases/connection
	 * Returns connection details and server information
	 * (PostgreSQL version, host, port, user, current database, connection counts)
	 * @returns {Object} Connection and server info
	 */
	.get("/connection", async (c): ApiHandler<ConnectionInfoSchemaType> => {
		const info = await getDatabaseConnectionInfo();
		return c.json({ data: info }, 200);
	});

export type DatabasesRoutes = typeof databasesRoutes.routes;
