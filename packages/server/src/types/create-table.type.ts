import { z } from "zod";

export const FOREIGN_KEY_ACTIONS = [
	"CASCADE",
	"SET NULL",
	"SET DEFAULT",
	"RESTRICT",
	"NO ACTION",
] as const;
export const foreignKeyActionSchema = z.enum(FOREIGN_KEY_ACTIONS);
export type ForeignKeyAction = z.infer<typeof foreignKeyActionSchema>;

export const fieldDataSchema = z.object({
	columnName: z.string().min(1),
	columnType: z.string().min(1),
	defaultValue: z.string(),
	isPrimaryKey: z.boolean(),
	isNullable: z.boolean(),
	isUnique: z.boolean(),
	isIdentity: z.boolean(),
	isArray: z.boolean(),
});
export type FieldDataType = z.infer<typeof fieldDataSchema>;

export const foreignKeyDataSchema = z.object({
	columnName: z.string().min(1),
	referencedTable: z.string().min(1),
	referencedColumn: z.string().min(1),
	onUpdate: foreignKeyActionSchema,
	onDelete: foreignKeyActionSchema,
});
export type ForeignKeyDataType = z.infer<typeof foreignKeyDataSchema>;

export const createTableSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	fields: z.array(fieldDataSchema).min(1, "At least one field is required"),
	foreignKeys: z.array(foreignKeyDataSchema).optional(),
});
export type CreateTableFormData = z.infer<typeof createTableSchema>;

export const tableNameParamSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
});

export const tableDataQuerySchema = z.object({
	page: z.string().optional().default("1").transform(Number),
	pageSize: z.string().optional().default("50").transform(Number),
	sort: z.string().optional().default(""),
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

export const insertRecordSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	data: z.record(z.string(), z.any()),
});

export const updateRecordsSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	updates: z
		.array(
			z.object({
				rowData: z.any(),
				columnName: z.string().min(1),
				value: z.any(),
			}),
		)
		.min(1, "At least one update is required"),
	primaryKey: z.string().optional(),
});

export const deleteRecordsSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	primaryKeys: z
		.array(
			z.object({
				columnName: z.string().min(1),
				value: z.any(),
			}),
		)
		.min(1, "At least one primary key is required"),
});

export const executeQuerySchema = z.object({
	query: z.string().min(1, "Query is required"),
});

export const databaseQuerySchema = z.object({
	database: z.string().optional(),
});
