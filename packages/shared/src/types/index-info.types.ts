import { z } from "zod";
import { databaseSchema, tableNameSchema, tableQuerySchema } from "./database.types.js";

export const INDEX_KINDS = ["primary", "unique-constraint", "index"] as const;

export const indexInfoSchema = z.object({
	indexName: z.string(),
	/** Key columns in index order; an expression key is its SQL text. */
	columns: z.array(z.string()),
	isUnique: z.boolean(),
	/** Document-index options; absent when the engine or index does not use them. */
	isSparse: z.boolean().optional(),
	expireAfterSeconds: z.number().nonnegative().optional(),
	/** Access method, e.g. "btree"; `null` when the engine has no such notion. */
	method: z.string().nullable(),
	/** Only "index" can be dropped on its own; the others back a constraint. */
	kind: z.enum(INDEX_KINDS),
	/** Full CREATE INDEX text, set only for partial or expression indexes. */
	definition: z.string().nullable(),
});

export type IndexInfoSchemaType = z.infer<typeof indexInfoSchema>;

export const createIndexSchema = z.object({
	indexName: z.string().min(1),
	columns: z.array(z.string().min(1)).min(1),
	isUnique: z.boolean(),
	method: z.string().optional(),
});

export type CreateIndexSchemaType = z.infer<typeof createIndexSchema>;

export const createIndexParamsSchema = createIndexSchema.extend({
	db: databaseSchema.shape.db,
	tableName: tableNameSchema.shape.tableName,
	schemaName: tableQuerySchema.shape.schemaName,
});

export type CreateIndexParamsSchemaType = z.infer<typeof createIndexParamsSchema>;

export const dropIndexParamSchema = z.object({
	tableName: z.string("Table name is required"),
	indexName: z.string("Index name is required"),
});

export const dropIndexParamsSchema = dropIndexParamSchema.extend({
	db: databaseSchema.shape.db,
	schemaName: tableQuerySchema.shape.schemaName,
});

export type DropIndexParamsSchemaType = z.infer<typeof dropIndexParamsSchema>;
