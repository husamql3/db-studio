import { Elysia } from "elysia";
import { getAdapter } from "@/adapters/adapter.registry.js";
import { getDbType } from "@/db-manager.js";

/**
 * /databases routes (at root level, no dbType required)
 * GET /databases - Get list of user-visible databases on the server (name, size, owner, encoding).
 * System databases are hidden unless currently connected (pg: postgres, rdsadmin, mysql:
 * information_schema/mysql/performance_schema/sys, mssql: database_id <= 4,
 * mongo: admin/config/local, sqlite: temp).
 * GET /databases/current - Get the name of the database we are currently connected to
 * GET /databases/connection - Get connection details and server information
 */
export const databasesRoutes = new Elysia({ prefix: "/databases" })
	.derive(() => {
		const dbType = getDbType();
		return { dbType, adapter: getAdapter(dbType) };
	})

	/**
	 * GET /databases
	 * Returns list of user-visible databases on the server (name, size, owner, encoding) and the database type
	 */
	.get("/", async ({ adapter, dbType }) => ({
		data: { databases: await adapter.getDatabasesList(), dbType },
	}))

	/**
	 * GET /databases/current
	 * Returns the name of the database we are currently connected to and the database type
	 */
	.get("/current", async ({ adapter, dbType }) => ({
		data: { db: (await adapter.getCurrentDatabase()).db, dbType },
	}))

	/**
	 * GET /databases/connection
	 * Returns connection details and server information
	 */
	.get("/connection", async ({ adapter }) => ({
		data: await adapter.getDatabaseConnectionInfo(),
	}));
