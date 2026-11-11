import { databaseSchema, executeQuerySchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const queryRoutes = new Elysia({ prefix: "/query" })
	.use(adapterPlugin)

	.post(
		"/",
		async ({ adapter, query: { db }, body: { query } }) => ({
			data: await adapter.executeQuery({ query, db }),
		}),
		{ query: databaseSchema, body: executeQuerySchema },
	);
