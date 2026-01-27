import { z } from "zod";
import { databaseSchema } from "./database.types";

export const deleteColumnQuerySchema = databaseSchema.extend({
	cascade: z
		.string()
		.optional()
		.transform((val) => val === "true"),
});

export type DeleteColumnQuerySchemaType = z.infer<typeof deleteColumnQuerySchema>;

export const deleteColumnParamSchema = z.object({
	tableName: z.string("Table name is required"),
	columnName: z.string("Column name is required"),
});

export const deleteColumnParamsSchema = z.object({
	db: databaseSchema.shape.db,
	tableName: deleteColumnParamSchema.shape.tableName,
	columnName: deleteColumnParamSchema.shape.columnName,
	cascade: z.boolean().optional(),
});

export type DeleteColumnParamsSchemaType = z.infer<typeof deleteColumnParamsSchema>;

export const deleteColumnSuccessResponseSchema = z.object({
	message: z.string("Message is required"),
	tableName: z.string("Table name is required"),
	columnName: z.string("Column name is required"),
	deletedCount: z.number("Deleted count is required").default(0),
});

export type DeleteColumnResponseType = z.infer<typeof deleteColumnSuccessResponseSchema>;
