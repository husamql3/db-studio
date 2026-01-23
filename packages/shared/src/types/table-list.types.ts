import { z } from "zod";
import { databaseSchema } from "./database.types.js";

export const tableInfoSchema = z.object({
	tableName: z.string("Table name is required"),
	rowCount: z.coerce.number("Row count is required"),
});

export type TableInfoSchemaType = z.infer<typeof tableInfoSchema>;

//! table-columns.types.ts
export const dataTypesSchema = z.enum([
	"text",
	"boolean",
	"number",
	"enum",
	"json",
	"date",
	"array",
]);

export const standardizedDataTypeSchema = z.enum([
	"int",
	"bigint",
	"smallint",
	"numeric",
	"float",
	"double",
	"money",
	"boolean",
	"text",
	"varchar",
	"char",
	"json",
	"jsonb",
	"xml",
	"uuid",
	"date",
	"time",
	"timestamp",
	"timestamptz",
	"interval",
	"bytea",
	"inet",
	"cidr",
	"macaddr",
	"macaddr8",
	"point",
	"line",
	"polygon",
	"array",
	"enum",
]);

export const columnInfoSchema = z.object({
	columnName: z.string(),
	dataType: dataTypesSchema,
	dataTypeLabel: standardizedDataTypeSchema,
	isNullable: z.boolean(),
	columnDefault: z.string().nullable(),
	isPrimaryKey: z.boolean(),
	isForeignKey: z.boolean(),
	referencedTable: z.string().nullable(),
	referencedColumn: z.string().nullable(),
	enumValues: z.array(z.string()).nullable(),
});

export type ColumnInfoSchemaType = z.infer<typeof columnInfoSchema>;

//! tables-data.types.ts
export const tableDataQuerySchema = z.object({
	database: databaseSchema.shape.database,
	cursor: z.string().optional(), // Base64 encoded cursor for pagination
	limit: z.string().optional().default("50").transform(Number),
	direction: z.enum(["forward", "backward"]).optional().default("forward"), // Pagination direction
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
	order: z.enum(["asc", "desc"]).optional(),
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
