import { Hono } from "hono";
import type {
	ConnectionInfoSchemaType,
	CurrentDatabaseSchemaType,
	DatabaseListSchemaType,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { getDaoFactory } from "@/dao/dao-factory.js";
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
		const dao = getDaoFactory(dbType);
		const databases = await dao.getDatabasesList();
		return c.json({ data: { databases, dbType } }, 200);
	})

	/**
	 * GET /databases/current
	 * Returns the name of the database we are currently connected to and the database type
	 */
	.get("/current", async (c): ApiHandler<CurrentDatabaseSchemaType> => {
		const dbType = getDbType();
		const dao = getDaoFactory(dbType);
		const current = await dao.getCurrentDatabase();
		return c.json({ data: { db: current.db, dbType } }, 200);
	})

	/**
	 * GET /databases/connection
	 * Returns connection details and server information
	 */
	.get("/connection", async (c): ApiHandler<ConnectionInfoSchemaType> => {
		const dbType = getDbType();
		const dao = getDaoFactory(dbType);
		const info = await dao.getDatabaseConnectionInfo();
		return c.json({ data: info }, 200);
	});

export type DatabasesRoutes = typeof databasesRoutes.routes;
