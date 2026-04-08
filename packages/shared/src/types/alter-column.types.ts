import { z } from "zod";
import { databaseSchema } from "./database.types";
import { deleteColumnParamSchema } from "./delete-column.types";

export const alterColumnSchema = z.object({
	columnType: z.string("Column type is required"),
	isNullable: z.boolean(),
	defaultValue: z.string().nullable().optional(),
});

export type AlterColumnSchemaType = z.infer<typeof alterColumnSchema>;

export const alterColumnParamSchema = deleteColumnParamSchema;

export type AlterColumnParamSchemaType = z.infer<typeof alterColumnParamSchema>;

export const alterColumnParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: deleteColumnParamSchema.shape.tableName,
	columnName: deleteColumnParamSchema.shape.columnName,
	columnType: alterColumnSchema.shape.columnType,
	isNullable: alterColumnSchema.shape.isNullable,
	defaultValue: alterColumnSchema.shape.defaultValue,
});

export type AlterColumnParamsSchemaType = z.infer<typeof alterColumnParamsSchema>;
