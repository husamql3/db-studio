import { z } from "zod";

export const updateRecordsSchema = z.object({
	tableName: z.string("Table name is required"),
	primaryKey: z.string("Primary key is required").default("id"),
	/**
	 * Every component of a composite primary key. When present it takes precedence
	 * over `primaryKey`, so a row is matched on all of its key columns instead of
	 * only the first one.
	 */
	primaryKeys: z.array(z.string().min(1)).min(1).optional(),
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
