import { z } from "zod";
import { foreignKeyActionSchema } from "./foreign-key-actions.js";

export const fieldDataSchema = z.object({
	columnName: z.string().min(1, "Column name is required"),
	columnType: z.string().min(1, "Column type is required"),
	defaultValue: z.string(),
	isPrimaryKey: z.boolean(),
	isNullable: z.boolean(),
	isUnique: z.boolean(),
	isIdentity: z.boolean(),
	isArray: z.boolean(),
});
export type FieldDataType = z.infer<typeof fieldDataSchema>;

export const foreignKeyDataSchema = z.object({
	columnName: z.string().min(1, "Column name is required"),
	referencedTable: z.string().min(1, "Referenced table is required"),
	referencedColumn: z.string().min(1, "Referenced column is required"),
	onUpdate: foreignKeyActionSchema,
	onDelete: foreignKeyActionSchema,
});
export type ForeignKeyDataType = z.infer<typeof foreignKeyDataSchema>;

export const addTableSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	fields: z.array(fieldDataSchema).min(1, "At least one column is required"),
	foreignKeys: z.preprocess((val) => {
		// Preprocess to filter out empty/incomplete foreign keys before validation
		if (!Array.isArray(val)) return undefined;
		return val.filter((fk) => {
			// Remove null entries
			if (fk === null || fk === undefined) return false;
			// Remove empty foreign key objects (where all required fields are empty)
			if (typeof fk === "object") {
				const hasRequiredFields =
					fk.columnName && fk.referencedTable && fk.referencedColumn;
				return hasRequiredFields;
			}
			return false;
		});
	}, z.array(foreignKeyDataSchema).optional()),
});
export type AddTableFormData = z.infer<typeof addTableSchema>;

export type AddTableOption = {
	name: keyof Pick<
		FieldDataType,
		"isNullable" | "isUnique" | "isIdentity" | "isArray"
	>;
	label: string;
	description: string;
};

export const tableNameParamSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
});

export const tableDataQuerySchema = z.object({
	database: z.string().min(1, "Database is required"),
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
