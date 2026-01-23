import { databaseSchema } from "shared/types/database.types.js";
import { z } from "zod";

//! create-table.types.ts
export const FOREIGN_KEY_ACTIONS = [
	"CASCADE",
	"SET NULL",
	"SET DEFAULT",
	"RESTRICT",
	"NO ACTION",
] as const;
export const foreignKeyActionSchema = z.enum(FOREIGN_KEY_ACTIONS);

export const fieldDataSchema = z.object({
	columnName: z.string("Column name is required"),
	columnType: z.string("Column type is required"),
	defaultValue: z.string().optional(),
	isPrimaryKey: z.boolean().default(false),
	isNullable: z.boolean().default(false),
	isUnique: z.boolean().default(false),
	isIdentity: z.boolean().default(false),
	isArray: z.boolean().default(false),
});
export type FieldDataType = z.infer<typeof fieldDataSchema>;

export const foreignKeyDataSchema = z.object({
	columnName: z.string("Column name is required"),
	referencedTable: z.string("Referenced table is required"),
	referencedColumn: z.string("Referenced column is required"),
	onUpdate: foreignKeyActionSchema.default("NO ACTION"),
	onDelete: foreignKeyActionSchema.default("NO ACTION"),
});
export type ForeignKeyDataType = z.infer<typeof foreignKeyDataSchema>;

export const createTableSchema = z.object({
	tableName: z.string("Table name is required"),
	fields: z.array(fieldDataSchema).min(1, "At least one field is required"),
	foreignKeys: z.array(foreignKeyDataSchema).optional(),
});
export type CreateTableSchemaType = z.infer<typeof createTableSchema>;

//! delete-column.types.ts
export const deleteColumnQuerySchema = databaseSchema.extend({
	cascade: z
		.string()
		.optional()
		.transform((val) => val === "true"),
});

export type DeleteColumnQuerySchemaType = z.infer<
	typeof deleteColumnQuerySchema
>;

export const deleteColumnParamSchema = z.object({
	tableName: z.string("Table name is required"),
	columnName: z.string("Column name is required"),
});

export const deleteColumnParamsSchema = z.object({
	database: databaseSchema.shape.database,
	tableName: deleteColumnParamSchema.shape.tableName,
	columnName: deleteColumnParamSchema.shape.columnName,
	cascade: z.boolean().optional(),
});

export type DeleteColumnParamsSchemaType = z.infer<
	typeof deleteColumnParamsSchema
>;

export const deleteColumnSuccessResponseSchema = z.object({
	message: z.string("Message is required"),
	tableName: z.string("Table name is required"),
	columnName: z.string("Column name is required"),
	deletedCount: z.number("Deleted count is required").default(0),
});

export type DeleteColumnResponseType = z.infer<
	typeof deleteColumnSuccessResponseSchema
>;

//! table.types.ts
export const tableNameSchema = z.object({
	tableName: z.string("Table name is required"),
});

export type TableNameSchemaType = z.infer<typeof tableNameSchema>;

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
