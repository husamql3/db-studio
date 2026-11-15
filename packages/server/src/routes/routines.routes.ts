import { databaseSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const routinesRoutes = new Elysia({ prefix: "/routines" })
	.use(adapterPlugin)
	.get("/", async ({ adapter, query }) => ({ data: await adapter.getRoutines(query) }), {
		query: databaseSchema,
	});
