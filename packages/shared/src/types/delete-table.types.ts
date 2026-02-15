import { z } from "zod";
import { databaseSchema } from "./database.types";
import type { RelatedRecord } from "./delete-record.types";

export const deleteTableQuerySchema = databaseSchema.extend({
	cascade: z
		.string()
		.optional()
		.transform((val) => val === "true"),
});

export type DeleteTableQuerySchemaType = z.infer<typeof deleteTableQuerySchema>;

export type DeleteTableParams = {
	tableName: string;
	db: string;
	cascade?: boolean;
};

export type DeleteTableResult = {
	deletedCount: number;
	fkViolation: boolean;
	relatedRecords: RelatedRecord[];
};
