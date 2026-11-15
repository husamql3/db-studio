import { databaseSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin, requireCapability } from "@/routes/adapter.plugin.js";

export const routinesRoutes = new Elysia({ prefix: "/routines" }).use(adapterPlugin).get(
	"/",
	async ({ adapter, dbType, query }) => {
		requireCapability(dbType, "routines");

		return { data: await adapter.getRoutines(query) };
	},
	{ query: databaseSchema },
);
