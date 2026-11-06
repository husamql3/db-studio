import { Elysia } from "elysia";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { ADAPTERS } from "@/adapters/adapter.registry.js";
import { requestConnection } from "@/open-connections.js";

export const databasesRoutes = new Elysia({ prefix: "/databases" })
	.derive(() => {
		const { dbType, parsed } = requestConnection();

		const adapter: IDbAdapter = ADAPTERS[dbType];

		return { dbType, address: { host: parsed.host, port: parsed.port }, adapter };
	})

	.get("/", async ({ adapter, dbType }) => ({
		data: { databases: await adapter.getDatabasesList(), dbType },
	}))

	.get("/current", async ({ adapter, dbType }) => ({
		data: { db: (await adapter.getCurrentDatabase()).db, dbType },
	}))

	.get("/connection", async ({ adapter, address }) => ({
		data: await adapter.getDatabaseConnectionInfo(address),
	}));
