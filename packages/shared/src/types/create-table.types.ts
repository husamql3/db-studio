import { z } from "zod";

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
