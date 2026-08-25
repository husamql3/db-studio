import {
	createKeySchema,
	type DeleteKeyResultSchemaType,
	databaseSchema,
	deleteKeyQuerySchema,
	type KeyDetailsResultSchemaType,
	type KeyRawResultSchemaType,
	type KeyScanResultSchemaType,
	type KeyWriteResultSchemaType,
	keyActionSchema,
	keyDetailsQuerySchema,
	keyParamSchema,
	keyRawQuerySchema,
	keyScanQuerySchema,
} from "@db-studio/shared/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getKeyValueAdapter } from "@/adapters/adapter.registry.js";
import type { ApiHandler, RouteEnv } from "@/app.types.js";

export const keysRoutes = new Hono<RouteEnv>()
	.basePath("/keys")
	.get(
		"/",
		zValidator("query", keyScanQuerySchema),
		async (c): ApiHandler<KeyScanResultSchemaType> => {
			const query = c.req.valid("query");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.scanKeys(query) }, 200);
		},
	)
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", createKeySchema),
		async (c): ApiHandler<KeyWriteResultSchemaType> => {
			const { db } = c.req.valid("query");
			const body = c.req.valid("json");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.createKey({ db, ...body }) }, 200);
		},
	)
	.get(
		"/:key/raw",
		zValidator("param", keyParamSchema),
		zValidator("query", keyRawQuerySchema),
		async (c): ApiHandler<KeyRawResultSchemaType> => {
			const { key } = c.req.valid("param");
			const query = c.req.valid("query");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.getStringChunk({ ...query, key }) }, 200);
		},
	)
	.get(
		"/:key",
		zValidator("param", keyParamSchema),
		zValidator("query", keyDetailsQuerySchema),
		async (c): ApiHandler<KeyDetailsResultSchemaType> => {
			const { key } = c.req.valid("param");
			const query = c.req.valid("query");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.getKeyDetails({ ...query, key }) }, 200);
		},
	)
	.post(
		"/:key/actions",
		zValidator("param", keyParamSchema),
		zValidator("query", databaseSchema),
		zValidator("json", keyActionSchema),
		async (c): ApiHandler<KeyWriteResultSchemaType> => {
			const { key } = c.req.valid("param");
			const { db } = c.req.valid("query");
			const body = c.req.valid("json");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.applyKeyAction({ db, key, ...body }) }, 200);
		},
	)
	.delete(
		"/:key",
		zValidator("param", keyParamSchema),
		zValidator("query", deleteKeyQuerySchema),
		async (c): ApiHandler<DeleteKeyResultSchemaType> => {
			const { key } = c.req.valid("param");
			const query = c.req.valid("query");
			const adapter = getKeyValueAdapter(c.get("dbType"));
			return c.json({ data: await adapter.deleteKey({ ...query, key }) }, 200);
		},
	);

export type KeysRoutes = typeof keysRoutes.routes;
