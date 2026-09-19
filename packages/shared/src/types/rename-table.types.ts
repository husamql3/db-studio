import { z } from "zod";
import { databaseSchema, tableNameSchema } from "./database.types";

export const renameTableSchema = z.object({
	// Trimmed server-side so whitespace-only names are rejected even if a
	// client skips the frontend trim (matches the sidebar dialog behavior).
	newTableName: z
		.string("New table name is required")
		.trim()
		.min(1, "New table name is required"),
});

export type RenameTableSchemaType = z.infer<typeof renameTableSchema>;

export const renameTableParamSchema = tableNameSchema;

export type RenameTableParamSchemaType = z.infer<typeof renameTableParamSchema>;

export const renameTableParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: tableNameSchema.shape.tableName,
	newTableName: renameTableSchema.shape.newTableName,
});

export type RenameTableParamsSchemaType = z.infer<typeof renameTableParamsSchema>;
