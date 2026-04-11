import { z } from "zod";
import { databaseSchema, tableNameSchema } from "./database.types";

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

export const addColumnParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: tableNameSchema.shape.tableName,
	columnName: addColumnSchema.shape.columnName,
	columnType: addColumnSchema.shape.columnType,
	defaultValue: addColumnSchema.shape.defaultValue,
	isPrimaryKey: addColumnSchema.shape.isPrimaryKey,
	isNullable: addColumnSchema.shape.isNullable,
	isUnique: addColumnSchema.shape.isUnique,
	isIdentity: addColumnSchema.shape.isIdentity,
	isArray: addColumnSchema.shape.isArray,
});

export type AddColumnParamsSchemaType = z.infer<typeof addColumnParamsSchema>;
