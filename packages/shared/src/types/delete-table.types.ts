import { z } from "zod";
import { tableQuerySchema } from "./database.types.js";
import type { RelatedRecord } from "./delete-record.types.js";

export const deleteTableQuerySchema = tableQuerySchema.extend({
	cascade: z
		.string()
		.optional()
		.transform((val) => val === "true"),
});

export type DeleteTableQuerySchemaType = z.infer<typeof deleteTableQuerySchema>;

export type DeleteTableParams = {
	tableName: string;
	schemaName?: string;
	db: string;
	cascade?: boolean;
};

export type DeleteTableResult = {
	deletedCount: number;
	fkViolation: boolean;
	relatedRecords: RelatedRecord[];
};
