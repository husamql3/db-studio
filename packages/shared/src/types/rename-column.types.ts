import { z } from "zod";
import { databaseSchema } from "./database.types";
import { deleteColumnParamSchema } from "./delete-column.types";

export const renameColumnSchema = z.object({
	newColumnName: z.string("New column name is required"),
});

export type RenameColumnSchemaType = z.infer<typeof renameColumnSchema>;

export const renameColumnParamSchema = deleteColumnParamSchema;

export type RenameColumnParamSchemaType = z.infer<typeof renameColumnParamSchema>;

export const renameColumnParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: deleteColumnParamSchema.shape.tableName,
	columnName: deleteColumnParamSchema.shape.columnName,
	newColumnName: renameColumnSchema.shape.newColumnName,
});

export type RenameColumnParamsSchemaType = z.infer<typeof renameColumnParamsSchema>;
