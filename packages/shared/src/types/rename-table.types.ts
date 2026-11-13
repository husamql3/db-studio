import { z } from "zod";
import { tableNameSchema, tableQuerySchema } from "./database.types.js";

export const renameTableSchema = z.object({
	// Trimmed server-side so whitespace-only names are rejected even if a
	// client skips the frontend trim (matches the sidebar dialog behavior).
	newTableName: z
		.string("New table name is required")
		.trim()
		.min(1, "New table name is required"),
});

export type RenameTableSchemaType = z.infer<typeof renameTableSchema>;

export const renameTableParamsSchema = renameTableSchema.extend({
	...tableQuerySchema.shape,
	...tableNameSchema.shape,
});

export type RenameTableParamsSchemaType = z.infer<typeof renameTableParamsSchema>;
