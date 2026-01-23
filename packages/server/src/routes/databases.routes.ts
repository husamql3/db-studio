import { Hono } from "hono";
import type {
	ConnectionInfoSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import {
	getCurrentDatabase,
	getDatabaseConnectionInfo,
	getDatabasesList,
} from "@/dao/database-list.dao.js";

/**
 * /databases routes
 * GET /databases - Get list of all databases on the server (name, size, owner, encoding)
 * GET /databases/current - Get the name of the database we are currently connected to
 * GET /databases/connection - Get connection details and server information (PostgreSQL version, host, port, user, current database, connection counts)
 */
export const databasesRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/databases/...
	 */
	.basePath("/databases")

	/**
	 * GET /databases
	 * Returns list of all databases on the server (name, size, owner, encoding)
	 * @returns {Array} List of database info objects
	 */
	.get("/", async (c): ApiHandler<DatabaseInfoSchemaType[]> => {
		const databases = await getDatabasesList();
		return c.json({ data: databases }, 200);
	})

	/**
	 * GET /databases/current
	 * Returns the name of the database we are currently connected to
	 * @returns {Object} Object with current database name
	 */
	.get("/current", async (c): ApiHandler<DatabaseSchemaType> => {
		const current = await getCurrentDatabase();
		return c.json({ data: current }, 200);
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
