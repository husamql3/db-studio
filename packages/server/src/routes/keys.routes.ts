import {
	createKeySchema,
	databaseSchema,
	deleteKeyQuerySchema,
	keyActionSchema,
	keyDetailsQuerySchema,
	keyParamSchema,
	keyRawQuerySchema,
	keyScanQuerySchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { assertKeyValueAdapter } from "@/adapters/adapter.registry.js";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const keysRoutes = new Elysia({ prefix: "/keys" })
	.use(adapterPlugin)
	.resolve(({ adapter, dbType }) => ({
		keyValueAdapter: assertKeyValueAdapter(adapter, dbType),
	}))
	.get(
		"/",
		async ({ keyValueAdapter, query }) => ({ data: await keyValueAdapter.scanKeys(query) }),
		{ query: keyScanQuerySchema },
	)
	.post(
		"/",
		async ({ keyValueAdapter, query: { db }, body }) => ({
			data: await keyValueAdapter.createKey({ db, ...body }),
		}),
		{ query: databaseSchema, body: createKeySchema },
	)
	.get(
		"/:key/raw",
		async ({ keyValueAdapter, query, params: { key } }) => ({
			data: await keyValueAdapter.getStringChunk({ ...query, key }),
		}),
		{ query: keyRawQuerySchema, params: keyParamSchema },
	)
	.get(
		"/:key",
		async ({ keyValueAdapter, query, params: { key } }) => ({
			data: await keyValueAdapter.getKeyDetails({ ...query, key }),
		}),
		{ query: keyDetailsQuerySchema, params: keyParamSchema },
	)
	.post(
		"/:key/actions",
		async ({ keyValueAdapter, query: { db }, params: { key }, body }) => ({
			data: await keyValueAdapter.applyKeyAction({ db, key, ...body }),
		}),
		{ query: databaseSchema, params: keyParamSchema, body: keyActionSchema },
	)
	.delete(
		"/:key",
		async ({ keyValueAdapter, query, params: { key } }) => ({
			data: await keyValueAdapter.deleteKey({ ...query, key }),
		}),
		{ query: deleteKeyQuerySchema, params: keyParamSchema },
	);
