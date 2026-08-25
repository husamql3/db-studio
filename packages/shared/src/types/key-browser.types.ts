import { z } from "zod";

export const redisKeyTypeSchema = z.enum([
	"string",
	"hash",
	"list",
	"set",
	"zset",
	"stream",
	"unknown",
]);
export type RedisKeyTypeSchemaType = z.infer<typeof redisKeyTypeSchema>;

export const encodedRedisValueSchema = z.object({
	base64: z.string(),
	utf8: z.string().optional(),
});
export type EncodedRedisValueSchemaType = z.infer<typeof encodedRedisValueSchema>;

export const keyScanQuerySchema = z.object({
	db: z.string(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	search: z.string().max(512).optional(),
	exactPattern: z.stringbool().default(false),
	type: redisKeyTypeSchema.exclude(["unknown"]).optional(),
});
export type KeyScanQuerySchemaType = z.infer<typeof keyScanQuerySchema>;

export const redisKeySummarySchema = z.object({
	key: encodedRedisValueSchema,
	type: redisKeyTypeSchema,
	ttlMs: z.number().int(),
	memoryBytes: z.number().int().nonnegative().nullable(),
});
export type RedisKeySummarySchemaType = z.infer<typeof redisKeySummarySchema>;

export const keyScanResultSchema = z.object({
	keys: z.array(redisKeySummarySchema),
	nextCursor: z.string().nullable(),
	hasMore: z.boolean(),
});
export type KeyScanResultSchemaType = z.infer<typeof keyScanResultSchema>;

export const keyDetailsQuerySchema = z.object({
	db: z.string(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
	full: z.stringbool().default(false),
	direction: z.enum(["forward", "backward"]).default("forward"),
});
export type KeyDetailsQuerySchemaType = z.infer<typeof keyDetailsQuerySchema>;

export const keyParamSchema = z.object({
	key: z.string().min(1), // "-" is the URL sentinel for Redis' valid empty binary key.
});

const redisStringValueSchema = z.object({
	kind: z.literal("string"),
	value: encodedRedisValueSchema,
	truncated: z.boolean(),
});

const redisHashValueSchema = z.object({
	kind: z.literal("hash"),
	entries: z.array(
		z.object({ field: encodedRedisValueSchema, value: encodedRedisValueSchema }),
	),
});

const redisListValueSchema = z.object({
	kind: z.literal("list"),
	entries: z.array(z.object({ index: z.number().int(), value: encodedRedisValueSchema })),
});

const redisSetValueSchema = z.object({
	kind: z.literal("set"),
	members: z.array(encodedRedisValueSchema),
});

const redisSortedSetValueSchema = z.object({
	kind: z.literal("zset"),
	entries: z.array(z.object({ member: encodedRedisValueSchema, score: z.number() })),
});

const redisStreamValueSchema = z.object({
	kind: z.literal("stream"),
	entries: z.array(
		z.object({
			id: z.string(),
			fields: z.array(
				z.object({ field: encodedRedisValueSchema, value: encodedRedisValueSchema }),
			),
		}),
	),
});

const redisUnknownValueSchema = z.object({ kind: z.literal("unknown") });

export const redisKeyValueSchema = z.discriminatedUnion("kind", [
	redisStringValueSchema,
	redisHashValueSchema,
	redisListValueSchema,
	redisSetValueSchema,
	redisSortedSetValueSchema,
	redisStreamValueSchema,
	redisUnknownValueSchema,
]);
export type RedisKeyValueSchemaType = z.infer<typeof redisKeyValueSchema>;

export const keyDetailsResultSchema = redisKeySummarySchema.extend({
	length: z.number().int().nonnegative().nullable(),
	revision: z.string(),
	value: redisKeyValueSchema,
	nextCursor: z.string().nullable(),
	hasMore: z.boolean(),
});
export type KeyDetailsResultSchemaType = z.infer<typeof keyDetailsResultSchema>;

export const keyRawQuerySchema = z.object({
	db: z.string(),
	offset: z.coerce.number().int().nonnegative().default(0),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(1024 * 1024)
		.default(1024 * 1024),
	expectedRevision: z.string().optional(),
});
export type KeyRawQuerySchemaType = z.infer<typeof keyRawQuerySchema>;

export const keyRawResultSchema = z.object({
	chunk: encodedRedisValueSchema,
	length: z.number().int().nonnegative(),
	nextOffset: z.number().int().nonnegative().nullable(),
	hasMore: z.boolean(),
});
export type KeyRawResultSchemaType = z.infer<typeof keyRawResultSchema>;

const createStringValueSchema = z.object({
	kind: z.literal("string"),
	value: encodedRedisValueSchema,
});

const createHashValueSchema = z.object({
	kind: z.literal("hash"),
	entries: z
		.array(z.object({ field: encodedRedisValueSchema, value: encodedRedisValueSchema }))
		.min(1),
});

const createListValueSchema = z.object({
	kind: z.literal("list"),
	entries: z.array(encodedRedisValueSchema).min(1),
});

const createSetValueSchema = z.object({
	kind: z.literal("set"),
	members: z.array(encodedRedisValueSchema).min(1),
});

const createSortedSetValueSchema = z.object({
	kind: z.literal("zset"),
	entries: z.array(z.object({ member: encodedRedisValueSchema, score: z.number() })).min(1),
});

const createStreamValueSchema = z.object({
	kind: z.literal("stream"),
	id: z.string().default("*"),
	fields: z
		.array(z.object({ field: encodedRedisValueSchema, value: encodedRedisValueSchema }))
		.min(1),
});

export const createKeySchema = z.object({
	key: encodedRedisValueSchema,
	type: redisKeyTypeSchema.exclude(["unknown"]),
	value: z.discriminatedUnion("kind", [
		createStringValueSchema,
		createHashValueSchema,
		createListValueSchema,
		createSetValueSchema,
		createSortedSetValueSchema,
		createStreamValueSchema,
	]),
	ttlMs: z.number().int().positive().nullable().default(null),
});
export type CreateKeySchemaType = z.infer<typeof createKeySchema>;

export const keyWriteResultSchema = z.object({
	key: encodedRedisValueSchema,
	revision: z.string().nullable(),
	deleted: z.boolean(),
});
export type KeyWriteResultSchemaType = z.infer<typeof keyWriteResultSchema>;

const renameKeyActionSchema = z.object({
	action: z.literal("rename"),
	newKey: encodedRedisValueSchema,
});

const setTtlKeyActionSchema = z.object({
	action: z.literal("setTtl"),
	ttlMs: z.number().int().positive().nullable(),
});

const setStringKeyActionSchema = z.object({
	action: z.literal("setString"),
	value: encodedRedisValueSchema,
});

const upsertHashKeyActionSchema = z.object({
	action: z.literal("upsertHash"),
	field: encodedRedisValueSchema,
	value: encodedRedisValueSchema,
});

const deleteHashKeyActionSchema = z.object({
	action: z.literal("deleteHash"),
	field: encodedRedisValueSchema,
});

const pushListKeyActionSchema = z.object({
	action: z.literal("pushList"),
	side: z.enum(["left", "right"]),
	value: encodedRedisValueSchema,
});

const setListKeyActionSchema = z.object({
	action: z.literal("setList"),
	index: z.number().int(),
	value: encodedRedisValueSchema,
});

const deleteListKeyActionSchema = z.object({
	action: z.literal("deleteList"),
	index: z.number().int(),
});

const addSetKeyActionSchema = z.object({
	action: z.literal("addSet"),
	member: encodedRedisValueSchema,
});

const removeSetKeyActionSchema = z.object({
	action: z.literal("removeSet"),
	member: encodedRedisValueSchema,
});

const upsertSortedSetKeyActionSchema = z.object({
	action: z.literal("upsertZset"),
	member: encodedRedisValueSchema,
	score: z.number(),
});

const removeSortedSetKeyActionSchema = z.object({
	action: z.literal("removeZset"),
	member: encodedRedisValueSchema,
});

const appendStreamKeyActionSchema = z.object({
	action: z.literal("appendStream"),
	id: z.string().default("*"),
	fields: z
		.array(z.object({ field: encodedRedisValueSchema, value: encodedRedisValueSchema }))
		.min(1),
});

const deleteStreamKeyActionSchema = z.object({
	action: z.literal("deleteStream"),
	id: z.string(),
});

export const keyActionSchema = z.object({
	expectedRevision: z.string(),
	force: z.boolean().default(false),
	operation: z.discriminatedUnion("action", [
		renameKeyActionSchema,
		setTtlKeyActionSchema,
		setStringKeyActionSchema,
		upsertHashKeyActionSchema,
		deleteHashKeyActionSchema,
		pushListKeyActionSchema,
		setListKeyActionSchema,
		deleteListKeyActionSchema,
		addSetKeyActionSchema,
		removeSetKeyActionSchema,
		upsertSortedSetKeyActionSchema,
		removeSortedSetKeyActionSchema,
		appendStreamKeyActionSchema,
		deleteStreamKeyActionSchema,
	]),
});
export type KeyActionSchemaType = z.infer<typeof keyActionSchema>;

export const deleteKeyQuerySchema = z.object({
	db: z.string(),
	expectedRevision: z.string(),
	force: z.stringbool().default(false),
});
export type DeleteKeyQuerySchemaType = z.infer<typeof deleteKeyQuerySchema>;

export const deleteKeyResultSchema = z.object({ deleted: z.boolean() });
export type DeleteKeyResultSchemaType = z.infer<typeof deleteKeyResultSchema>;
