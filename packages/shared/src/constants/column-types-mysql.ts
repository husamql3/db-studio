export const MYSQL_COLUMN_TYPES = [
	// Numeric
	{ value: "tinyint", label: "tinyint" },
	{ value: "smallint", label: "smallint" },
	{ value: "mediumint", label: "mediumint" },
	{ value: "int", label: "int" },
	{ value: "bigint", label: "bigint" },
	{ value: "decimal", label: "decimal" },
	{ value: "float", label: "float" },
	{ value: "double", label: "double" },
	{ value: "bit", label: "bit" },
	// Boolean
	{ value: "boolean", label: "boolean" },
	// Text
	{ value: "char", label: "char" },
	{ value: "varchar", label: "varchar" },
	{ value: "tinytext", label: "tinytext" },
	{ value: "text", label: "text" },
	{ value: "mediumtext", label: "mediumtext" },
	{ value: "longtext", label: "longtext" },
	// Binary
	{ value: "binary", label: "binary" },
	{ value: "varbinary", label: "varbinary" },
	{ value: "tinyblob", label: "tinyblob" },
	{ value: "blob", label: "blob" },
	{ value: "mediumblob", label: "mediumblob" },
	{ value: "longblob", label: "longblob" },
	// JSON
	{ value: "json", label: "json" },
	// Date / Time
	{ value: "date", label: "date" },
	{ value: "time", label: "time" },
	{ value: "datetime", label: "datetime" },
	{ value: "timestamp", label: "timestamp" },
	{ value: "year", label: "year" },
	// Complex
	{ value: "enum", label: "enum" },
	{ value: "set", label: "set" },
] as const;

export type MysqlColumnType = (typeof MYSQL_COLUMN_TYPES)[number]["value"];
