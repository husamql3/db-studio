import { z } from "zod";

export const tableInfoSchema = z.object({
	tableName: z.string("Table name is required"),
	rowCount: z.coerce.number("Row count is required"),
});

export type TableInfoSchemaType = z.infer<typeof tableInfoSchema>;
