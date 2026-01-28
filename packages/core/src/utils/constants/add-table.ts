import type { AddTableOption } from "@/types/add-table.type";

export const PSQL_TYPES = {
	numeric: [
		{
			value: "int2",
			label: "int2",
			description: "Signed two-byte integer",
		},
		{
			value: "int4",
			label: "int4",
			description: "Signed four-byte integer",
		},
		{
			value: "int8",
			label: "int8",
			description: "Signed eight-byte integer",
		},
		{
			value: "float4",
			label: "float4",
			description: "Single precision floating-point number (4 bytes)",
		},
		{
			value: "float8",
			label: "float8",
			description: "Double precision floating-point number (8 bytes)",
		},
		{
			value: "numeric",
			label: "numeric",
			description: "Exact numeric of selectable precision",
		},
		{
			value: "serial",
			label: "serial",
			description: "Auto-incrementing four-byte integer",
		},
		{
			value: "bigserial",
			label: "bigserial",
			description: "Auto-incrementing eight-byte integer",
		},
	],
	text: [
		{
			value: "text",
			label: "text",
			description: "Variable-length character string",
		},
		{
			value: "varchar",
			label: "varchar",
			description: "Variable-length character string",
		},
		{
			value: "char",
			label: "char",
			description: "Fixed-length character string",
		},
		{
			value: "uuid",
			label: "uuid",
			description: "Universally unique identifier",
		},
	],
	boolean: [
		{
			value: "boolean",
			label: "boolean",
			description: "Logical boolean (true/false)",
		},
	],
	datetime: [
		{
			value: "date",
			label: "date",
			description: "Calendar date (year, month, day)",
		},
		{
			value: "time",
			label: "time",
			description: "Time of day (no time zone)",
		},
		{
			value: "timestamp",
			label: "timestamp",
			description: "Date and time (no time zone)",
		},
		{
			value: "timestamptz",
			label: "timestamptz",
			description: "Date and time with time zone",
		},
		{ value: "interval", label: "interval", description: "Time span" },
	],
	json: [
		{ value: "json", label: "json", description: "Textual JSON data" },
		{
			value: "jsonb",
			label: "jsonb",
			description: "Binary JSON data, decomposed",
		},
	],
	binary: [
		{
			value: "bytea",
			label: "bytea",
			description: 'Binary data ("byte array")',
		},
	],
	network: [
		{
			value: "inet",
			label: "inet",
			description: "IPv4 or IPv6 host address",
		},
		{
			value: "cidr",
			label: "cidr",
			description: "IPv4 or IPv6 network address",
		},
		{
			value: "macaddr",
			label: "macaddr",
			description: "MAC (Media Access Control) address",
		},
		{
			value: "macaddr8",
			label: "macaddr8",
			description: "MAC address (EUI-64 format)",
		},
	],
	geometric: [
		{
			value: "point",
			label: "point",
			description: "Geometric point on a plane",
		},
		{
			value: "line",
			label: "line",
			description: "Infinite line on a plane",
		},
		{
			value: "polygon",
			label: "polygon",
			description: "Closed geometric path on a plane",
		},
	],
	other: [{ value: "xml", label: "xml", description: "XML data" }],
};

// export const PSQL_TYPE_LABEL_MAP: Record<string, string> = Object.values(PSQL_TYPES)
// 	.flat()
// 	.reduce(
// 		(acc, item) => {
// 			acc[item.value] = item.label;
// 			return acc;
// 		},
// 		{} as Record<string, string>,
// 	);

// Serial types that auto-increment (incompatible with identity)
export const SERIAL_TYPES = ["serial", "bigserial"];

// Types that can be arrays
export const ARRAY_COMPATIBLE_TYPES = [
	"int2",
	"int4",
	"int8",
	"float4",
	"float8",
	"numeric",
	"text",
	"varchar",
	"char",
	"uuid",
	"boolean",
	"date",
	"time",
	"timestamp",
	"timestamptz",
	"interval",
	"json",
	"jsonb",
	"bytea",
	"inet",
	"cidr",
	"macaddr",
	"macaddr8",
];

export const ADD_TABLE_OPTIONS: AddTableOption[] = [
	{
		name: "isNullable",
		label: "Is Nullable",
		description: "Specify if the column can assume a NULL value if no value is provided",
	},
	{
		name: "isUnique",
		label: "Is Unique",
		description: "Enforce if values in the column should be unique across rows",
	},
	{
		name: "isIdentity",
		label: "Is Identity",
		description: "Automatically assign a sequential unique number to the column",
	},
	{
		name: "isArray",
		label: "Define as Array",
		description: "Define your column as a variable-length multidimensional array",
	},
];

export const FOREIGN_KEY_ACTION_OPTIONS = [
	{ value: "NO ACTION", label: "No action" },
	{ value: "RESTRICT", label: "Restrict" },
	{ value: "CASCADE", label: "Cascade" },
	{ value: "SET NULL", label: "Set null" },
	{ value: "SET DEFAULT", label: "Set default" },
];
