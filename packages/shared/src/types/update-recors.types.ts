import { z } from "zod";

export const updateRecordsSchema = z.object({
	tableName: z.string("Table name is required"),
	primaryKey: z.string("Primary key is required").default("id"),
	updates: z
		.array(
			z.object(
				{
					rowData: z.record(z.string("Column name is required"), z.any()),
					columnName: z.string("Column name is required"),
					value: z.any(),
				},
				{
					message: "Each update must have a row data, column name, and value.",
				},
			),
		)
		.min(1, "At least one update is required"),
});

export type UpdateRecordsSchemaType = z.infer<typeof updateRecordsSchema>;
