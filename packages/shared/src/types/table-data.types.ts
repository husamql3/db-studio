import { z } from "zod";
import { databaseSchema } from "./database.types.js";

export const filterSchema = z.object({
	columnName: z.string(),
	operator: z.string(),
	value: z.string(),
});

export type FilterType = z.infer<typeof filterSchema>;

export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

export const sortSchema = z.object({
	columnName: z.string(),
	direction: z.enum(sortDirections),
});

export type SortType = z.infer<typeof sortSchema>;

export const tableDataMetaSchema = z.object({
	limit: z.number(),
	total: z.number(),
	hasNextPage: z.boolean(),
	hasPreviousPage: z.boolean(),
	nextCursor: z.string().nullable(),
	prevCursor: z.string().nullable(),
});

export const tableDataResultSchema = z.object({
	data: z.array(z.record(z.string(), z.unknown())),
	meta: tableDataMetaSchema,
});

export type TableDataResultSchemaType = z.infer<typeof tableDataResultSchema>;

export const tableDataQuerySchema = z.object({
	db: databaseSchema.shape.db,
	cursor: z.string().optional(), // Base64 encoded cursor for pagination
	limit: z.string().optional().default("50").transform(Number),
	direction: z.enum(sortDirections).optional().default(sortDirections[0]), // Pagination direction
	sort: z
		.string()
		.optional()
		.transform((val) => {
			if (!val) return "";

			try {
				const parsed = JSON.parse(val);
				if (Array.isArray(parsed)) {
					return parsed;
				}
				return val;
			} catch {
				return val;
			}
		}),
	order: z.enum(sortDirections).optional(),
	filters: z
		.string()
		.optional()
		.transform((val) => {
			if (!val) return [];
			try {
				return JSON.parse(val);
			} catch {
				return [];
			}
		}),
});

export type TableDataQuerySchemaType = z.infer<typeof tableDataQuerySchema>;

export interface CursorData {
	values: Record<string, unknown>;
	sortColumns: string[];
}
