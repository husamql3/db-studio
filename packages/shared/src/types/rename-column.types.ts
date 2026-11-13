import { z } from "zod";
import { tableQuerySchema } from "./database.types.js";
import { deleteColumnParamSchema } from "./delete-column.types.js";

export const renameColumnSchema = z.object({
	newColumnName: z.string("New column name is required"),
});

export type RenameColumnSchemaType = z.infer<typeof renameColumnSchema>;

export const renameColumnParamsSchema = renameColumnSchema.extend({
	...tableQuerySchema.shape,
	...deleteColumnParamSchema.shape,
});

export type RenameColumnParamsSchemaType = z.infer<typeof renameColumnParamsSchema>;
