import { z } from "zod";

export const addRecordSchema = z.object({
	tableName: z.string("Table name is required"),
	data: z.record(z.string("Column name is required"), z.any()),
});

export type AddRecordSchemaType = z.infer<typeof addRecordSchema>;
