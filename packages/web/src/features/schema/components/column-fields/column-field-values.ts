import { z } from "zod";

export const columnFieldSchema = z.object({
	columnName: z.string().min(1, "Column name is required"),
	columnType: z.string().min(1, "Column type is required"),
	defaultValue: z.string(),
	isPrimaryKey: z.boolean(),
	isNullable: z.boolean(),
	isUnique: z.boolean(),
	isIdentity: z.boolean(),
	isArray: z.boolean(),
});

export type ColumnFieldValues = z.infer<typeof columnFieldSchema>;

export const DEFAULT_COLUMN_FIELD: ColumnFieldValues = {
	columnName: "",
	columnType: "",
	defaultValue: "",
	isPrimaryKey: false,
	isNullable: true,
	isUnique: false,
	isIdentity: false,
	isArray: false,
};

export type ColumnOptionName = keyof Pick<
	ColumnFieldValues,
	"isNullable" | "isUnique" | "isIdentity" | "isArray"
>;

export type ColumnOption = {
	name: ColumnOptionName;
	label: string;
	description: string;
};
