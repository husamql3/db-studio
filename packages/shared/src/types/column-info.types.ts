import { z } from "zod";

const dataTypes = [
	"text",
	"boolean",
	"number",
	"enum",
	"json",
	"date",
	"array",
] as const;

export const dataTypesSchema = z.enum(dataTypes);
export type DataTypes = z.infer<typeof dataTypesSchema>;

export const DataTypes = {
	text: "text",
	boolean: "boolean",
	number: "number",
	enum: "enum",
	json: "json",
	date: "date",
	array: "array",
} as const satisfies Record<DataTypes, string>;

const standardizedDataTypes = [
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
] as const;

export const standardizedDataTypeSchema = z.enum(standardizedDataTypes);

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
