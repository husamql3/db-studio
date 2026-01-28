import { z } from "zod";

const fieldSchema = z.object({
	columnName: z.string().min(1, "Column name is required"),
	columnType: z.string().min(1, "Column type is required"),
	defaultValue: z.string(),
	isPrimaryKey: z.boolean(),
	isNullable: z.boolean(),
	isUnique: z.boolean(),
	isIdentity: z.boolean(),
	isArray: z.boolean(),
});

const foreignKeySchema = z.object({
	columnName: z.string().min(1, "Column name is required"), // Current table column
	referencedTable: z.string().min(1, "Referenced table is required"), // Target table name
	referencedColumn: z.string().min(1, "Referenced column is required"), // Target column
	onUpdate: z
		.enum(["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"])
		.default("NO ACTION"),
	onDelete: z
		.enum(["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"])
		.default("NO ACTION"),
});

export const addTableSchema = z.object({
	tableName: z.string().min(1, "Table name is required"),
	fields: z.array(fieldSchema).min(1, "At least one column is required"),
	foreignKeys: z.preprocess((val) => {
		// Preprocess to filter out empty/incomplete foreign keys before validation
		if (!Array.isArray(val)) return undefined;
		return val.filter((fk) => {
			// Remove null entries
			if (fk === null || fk === undefined) return false;
			// Remove empty foreign key objects (where all required fields are empty)
			if (typeof fk === "object") {
				const hasRequiredFields = fk.columnName && fk.referencedTable && fk.referencedColumn;
				return hasRequiredFields;
			}
			return false;
		});
	}, z.array(foreignKeySchema).optional()),
});

export type FieldData = z.infer<typeof fieldSchema>;
export type AddTableFormData = z.infer<typeof addTableSchema>;

export type ForeignKeyData = z.infer<typeof foreignKeySchema>;

export type AddTableOption = {
	name: keyof Pick<FieldData, "isNullable" | "isUnique" | "isIdentity" | "isArray">;
	label: string;
	description: string;
};
