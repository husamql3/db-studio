import { z } from "zod";

export const tableInfoSchema = z.object({
	tableName: z.string("Table name is required"),
	schemaName: z.string().optional(),
	rowCount: z.coerce.number("Row count is required"),
	/** True when rowCount is the database's statistics estimate instead of an exact count. */
	rowCountEstimated: z.boolean().optional(),
});

export type TableInfoSchemaType = z.infer<typeof tableInfoSchema>;
