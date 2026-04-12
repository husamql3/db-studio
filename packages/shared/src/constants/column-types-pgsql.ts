export const PGSQL_COLUMN_TYPES = [
	// Numeric
	{ value: "integer", label: "integer" },
	{ value: "bigint", label: "bigint" },
	{ value: "smallint", label: "smallint" },
	{ value: "numeric", label: "numeric" },
	{ value: "real", label: "real" },
	{ value: "double precision", label: "double precision" },
	{ value: "money", label: "money" },
	{ value: "serial", label: "serial" },
	{ value: "bigserial", label: "bigserial" },
	// Boolean
	{ value: "boolean", label: "boolean" },
	// Text
	{ value: "text", label: "text" },
	{ value: "varchar", label: "varchar" },
	{ value: "char", label: "char" },
	// JSON
	{ value: "json", label: "json" },
	{ value: "jsonb", label: "jsonb" },
	{ value: "xml", label: "xml" },
	// UUID
	{ value: "uuid", label: "uuid" },
	// Date / Time
	{ value: "date", label: "date" },
	{ value: "time", label: "time" },
	{ value: "timestamp", label: "timestamp" },
	{ value: "timestamptz", label: "timestamptz" },
	{ value: "interval", label: "interval" },
	// Binary
	{ value: "bytea", label: "bytea" },
	// Network
	{ value: "inet", label: "inet" },
	{ value: "cidr", label: "cidr" },
	{ value: "macaddr", label: "macaddr" },
	{ value: "macaddr8", label: "macaddr8" },
	// Geometric
	{ value: "point", label: "point" },
	{ value: "line", label: "line" },
	{ value: "polygon", label: "polygon" },
] as const;

export type PgsqlColumnType = (typeof PGSQL_COLUMN_TYPES)[number]["value"];
