import { z } from "zod";
import { databaseSchema, tableQuerySchema } from "./database.types.js";
import { deleteColumnParamSchema } from "./delete-column.types.js";

export const renameColumnSchema = z.object({
	newColumnName: z.string("New column name is required"),
});

export type RenameColumnSchemaType = z.infer<typeof renameColumnSchema>;

export const renameColumnParamSchema = deleteColumnParamSchema;

export type RenameColumnParamSchemaType = z.infer<typeof renameColumnParamSchema>;

export const renameColumnParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: deleteColumnParamSchema.shape.tableName,
	schemaName: tableQuerySchema.shape.schemaName,
	columnName: deleteColumnParamSchema.shape.columnName,
	newColumnName: renameColumnSchema.shape.newColumnName,
});

export type RenameColumnParamsSchemaType = z.infer<typeof renameColumnParamsSchema>;
