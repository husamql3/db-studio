import { z } from "zod";

const dataTypes = ["text", "boolean", "number", "enum", "json", "date", "array"] as const;

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
	// PostgreSQL numeric types
	"int",
	"bigint",
	"smallint",
	"numeric",
	"float",
	"double",
	"money",
	// MySQL numeric types
	"tinyint",
	"mediumint",
	"bit",
	// Boolean
	"boolean",
	// Text types (shared)
	"text",
	"varchar",
	"char",
	// MySQL text types
	"tinytext",
	"mediumtext",
	"longtext",
	// JSON types
	"json",
	"jsonb",
	"xml",
	// UUID
	"uuid",
	// Date/Time types (shared)
	"date",
	"time",
	"timestamp",
	// PostgreSQL date/time
	"timestamptz",
	"interval",
	// MySQL date/time
	"datetime",
	"year",
	// PostgreSQL binary/network/geometric types
	"bytea",
	"inet",
	"cidr",
	"macaddr",
	"macaddr8",
	"point",
	"line",
	"polygon",
	// MySQL binary types
	"binary",
	"varbinary",
	"blob",
	"tinyblob",
	"mediumblob",
	"longblob",
	// Complex types (shared)
	"array",
	"enum",
	// MySQL set type
	"set",
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
