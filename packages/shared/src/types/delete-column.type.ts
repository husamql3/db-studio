import { z } from "zod";

// URL params schema (tableName and columnName come from URL path)
export const deleteColumnParamSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	columnName: z.string().min(1, "Column name is required"),
});

// Query params schema (cascade comes from query string)
export const deleteColumnQuerySchema = z.object({
	database: z.string().optional(),
	cascade: z
		.string()
		.optional()
		.transform((val) => val === "true"),
});

// Combined type for the hook/frontend
export type DeleteColumnParams = z.infer<typeof deleteColumnParamSchema> & {
	cascade?: boolean;
};

export type DeleteColumnResponse = {
	success: boolean;
	message: string;
	tableName: string;
	columnName: string;
	deletedCount: number;
};
