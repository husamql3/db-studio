import { databaseSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const logsRoutes = new Elysia({ prefix: "/logs" })
	.use(adapterPlugin)

	/**
	 * GET /logs
	 * Returns the newest entries of the database server's own log
	 */
	.get("/", async ({ adapter, query }) => ({ data: await adapter.getServerLogs(query) }), {
		query: databaseSchema,
	});
