import { z } from "zod";
import type { DatabaseSchemaType } from "./database.types";

export type BulkInsertRecordsParams = {
	tableName: string;
	records: Record<string, unknown>[];
	db: DatabaseSchemaType["db"];
};

export type BulkInsertResult = {
	success: boolean;
	message: string;
	successCount: number;
	failureCount: number;
	errors?: Array<{ recordIndex: number; error: string }>;
};

export const bulkInsertRecordsSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	records: z.array(z.record(z.string(), z.any())).min(1, "At least one record is required"),
});
