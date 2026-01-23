import { z } from "zod";

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
