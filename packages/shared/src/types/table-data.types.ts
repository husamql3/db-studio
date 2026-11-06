import { z } from "zod";
import { tableQuerySchema } from "./database.types.js";

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
	/** True when total is the database's statistics estimate instead of an exact count. */
	totalEstimated: z.boolean().optional(),
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

export const tableDataQuerySchema = tableQuerySchema
	.extend({
		cursor: z.string().optional(), // Base64 encoded cursor for pagination
		limit: z.string().optional().default("50").transform(Number),
		direction: z.enum(sortDirections).optional().default(sortDirections[0]),
		/** A JSON array of sorts, or one column name sorted in `order`. */
		sort: z
			.string()
			.optional()
			.transform((val) => {
				if (!val) return "";

				try {
					const parsed = JSON.parse(val);

					return Array.isArray(parsed) ? parsed : val;
				} catch {
					return val;
				}
			})
			// Re-validate the parsed JSON: its fields reach SQL as identifiers and keywords.
			.pipe(z.union([z.string(), z.array(sortSchema)])),
		order: z.enum(sortDirections).optional().default(sortDirections[0]),
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
			})
			.pipe(z.array(filterSchema)),
	})
	// Adapters see the sort as a list; `order` stays the key's direction when nothing is sorted.
	.transform(({ sort, ...query }) => ({
		...query,
		sort:
			typeof sort === "string"
				? sort
					? [{ columnName: sort, direction: query.order }]
					: []
				: sort,
	}));
