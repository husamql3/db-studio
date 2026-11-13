import { z } from "zod";
import { tableQuerySchema } from "./database.types.js";
import { deleteColumnParamSchema } from "./delete-column.types.js";

export const alterColumnSchema = z.object({
	columnType: z.string("Column type is required"),
	isNullable: z.boolean(),
	defaultValue: z.string().nullable().optional(),
});

export type AlterColumnSchemaType = z.infer<typeof alterColumnSchema>;

export const alterColumnParamsSchema = alterColumnSchema.extend({
	...tableQuerySchema.shape,
	...deleteColumnParamSchema.shape,
});

export type AlterColumnParamsSchemaType = z.infer<typeof alterColumnParamsSchema>;
