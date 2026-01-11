import { Hono } from "hono";
import {
	getCurrentDatabase,
	getDatabaseConnectionInfo,
	getDatabasesList,
} from "@/dao/database-list.dao.js";

export const databasesRoutes = new Hono();

/**
 * GET /databases - Get list of all databases
 */
databasesRoutes.get("/", async (c) => {
	try {
		const databases = await getDatabasesList();
		return c.json(databases);
	} catch (error) {
		console.error("Error fetching databases list:", error);
		return c.json({ error: "Failed to fetch databases list" }, 500);
	}
});

/**
 * GET /databases/current - Get current database name
 */
databasesRoutes.get("/current", async (c) => {
	try {
		const current = await getCurrentDatabase();
		return c.json(current);
	} catch (error) {
		console.error("Error fetching current database:", error);
		return c.json({ error: "Failed to fetch current database" }, 500);
	}
});

/**
 * GET /databases/connection - Get database connection information
 */
databasesRoutes.get("/connection", async (c) => {
	try {
		const info = await getDatabaseConnectionInfo();
		return c.json(info);
	} catch (error) {
		console.error("Error fetching database connection info:", error);
		return c.json({ error: "Failed to fetch database connection info" }, 500);
	}
});
