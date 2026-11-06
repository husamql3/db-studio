import { z } from "zod";
import { tableNameSchema, tableQuerySchema } from "./database.types.js";

export const addColumnSchema = z.object({
	columnName: z.string("Column name is required"),
	columnType: z.string("Column type is required"),
	defaultValue: z.string().optional(),
	isPrimaryKey: z.boolean().default(false),
	isNullable: z.boolean().default(false),
	isUnique: z.boolean().default(false),
	isIdentity: z.boolean().default(false),
	isArray: z.boolean().default(false),
});

export type AddColumnSchemaType = z.infer<typeof addColumnSchema>;

export const addColumnParamSchema = tableNameSchema;

export type AddColumnParamSchemaType = z.infer<typeof addColumnParamSchema>;

export const addColumnParamsSchema = addColumnSchema.extend({
	...tableQuerySchema.shape,
	...tableNameSchema.shape,
});

export type AddColumnParamsSchemaType = z.infer<typeof addColumnParamsSchema>;
