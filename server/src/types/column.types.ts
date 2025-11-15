/**
 * Simplified, generalized data types for frontend rendering
 * Makes it easy to determine which cell component to use
 */
export enum DataType {
	// Short text - for single-line text input
	short_text = "short-text",

	// Long text - for multi-line text input
	long_text = "long-text",

	// Boolean - for checkbox/toggle
	boolean = "boolean",

	// Numeric types - for number input
	number = "number",

	// Array - for array viewer/editor
	// array = "array",

	// Enum - for dropdown/select with predefined values
	// enum = "enum",
}

/**
 * Maps PostgreSQL data types to generic DataType enum
 */
export function mapPostgresToDataType(pgType: string): DataType {
	// Normalize to lowercase and handle composite types
	const normalized = pgType.toLowerCase().trim();

	// Handle array types
	if (normalized.startsWith("array") || normalized.includes("[]")) {
		return DataType.long_text;
	}

	// Numeric types - map to number
	if (
		normalized === "integer" ||
		normalized === "int" ||
		normalized === "int4" ||
		normalized === "bigint" ||
		normalized === "int8" ||
		normalized === "smallint" ||
		normalized === "int2" ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "real" ||
		normalized === "float4" ||
		normalized === "double precision" ||
		normalized === "float8" ||
		normalized === "float" ||
		normalized === "serial" ||
		normalized === "serial4" ||
		normalized === "bigserial" ||
		normalized === "serial8" ||
		normalized === "money"
	) {
		return DataType.number;
	}

	// Boolean
	if (normalized === "boolean" || normalized === "bool") {
		return DataType.boolean;
	}

	// Enum types
	if (normalized.startsWith("user-defined") || normalized === "enum") {
		return DataType.long_text;
	}

	// Long string types (text, xml, json)
	if (normalized === "text" || normalized === "xml" || normalized === "json" || normalized === "jsonb") {
		return DataType.long_text;
	}

	// Short string types (varchar, char, uuid, date, timestamp, etc.)
	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(") ||
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar" ||
		normalized === "uuid" ||
		normalized === "date" ||
		normalized === "time" ||
		normalized === "time without time zone" ||
		normalized.startsWith("time(") ||
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(") ||
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(") ||
		normalized === "interval" ||
		normalized.startsWith("interval") ||
		normalized === "bytea" ||
		normalized === "point" ||
		normalized === "line" ||
		normalized === "polygon" ||
		normalized === "inet" ||
		normalized === "cidr" ||
		normalized === "macaddr" ||
		normalized === "macaddr8"
	) {
		return DataType.short_text;
	}

	// Default to short-text for unrecognized types
	return DataType.short_text;
}

/**
 * Maps PostgreSQL data types to standardized display labels
 */
export function standardizeDataTypeLabel(pgType: string): string {
	const normalized = pgType.toLowerCase().trim();

	// Numeric types
	if (
		normalized === "integer" ||
		normalized === "int" ||
		normalized === "int4" ||
		normalized === "serial" ||
		normalized === "serial4"
	) {
		return "int";
	}

	if (normalized === "bigint" || normalized === "int8" || normalized === "bigserial" || normalized === "serial8") {
		return "bigint";
	}

	if (normalized === "smallint" || normalized === "int2") {
		return "smallint";
	}

	if (
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(")
	) {
		return "numeric";
	}

	if (normalized === "real" || normalized === "float4") {
		return "float";
	}

	if (normalized === "double precision" || normalized === "float8" || normalized === "float") {
		return "double";
	}

	if (normalized === "money") {
		return "money";
	}

	// Boolean
	if (normalized === "boolean" || normalized === "bool") {
		return "boolean";
	}

	// Text types
	if (normalized === "text") {
		return "text";
	}

	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(")
	) {
		return "varchar";
	}

	if (
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar"
	) {
		return "char";
	}

	// JSON types
	if (normalized === "json") {
		return "json";
	}

	if (normalized === "jsonb") {
		return "jsonb";
	}

	if (normalized === "xml") {
		return "xml";
	}

	// UUID
	if (normalized === "uuid") {
		return "uuid";
	}

	// Date/Time types
	if (normalized === "date") {
		return "date";
	}

	if (normalized === "time" || normalized === "time without time zone" || normalized.startsWith("time(")) {
		return "time";
	}

	if (
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(")
	) {
		return "timestamp";
	}

	if (
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(")
	) {
		return "timestamptz";
	}

	if (normalized === "interval" || normalized.startsWith("interval")) {
		return "interval";
	}

	// Binary
	if (normalized === "bytea") {
		return "bytea";
	}

	// Network types
	if (normalized === "inet") {
		return "inet";
	}

	if (normalized === "cidr") {
		return "cidr";
	}

	if (normalized === "macaddr") {
		return "macaddr";
	}

	if (normalized === "macaddr8") {
		return "macaddr8";
	}

	// Geometric types
	if (normalized === "point") {
		return "point";
	}

	if (normalized === "line") {
		return "line";
	}

	if (normalized === "polygon") {
		return "polygon";
	}

	// Array types
	if (normalized.startsWith("array") || normalized.includes("[]")) {
		return "array";
	}

	// User-defined types (enums)
	if (normalized.startsWith("user-defined") || normalized === "enum") {
		return "enum";
	}

	// Default: return the original type
	return pgType;
}

/**
 * Maps MySQL data types to generic DataType enum
 */
export function mapMySQLToDataType(mysqlType: string): DataType {
	const normalized = mysqlType.toLowerCase().trim();

	// Boolean (MySQL uses TINYINT(1)) - check this first before numeric
	if (normalized === "boolean" || normalized === "bool" || normalized === "tinyint(1)") {
		return DataType.boolean;
	}

	// Enum types
	if (normalized.startsWith("enum(") || normalized.startsWith("set(")) {
		return DataType.long_text;
	}

	// Numeric types - map to number
	if (
		normalized === "int" ||
		normalized === "integer" ||
		normalized.startsWith("int(") ||
		normalized === "bigint" ||
		normalized.startsWith("bigint(") ||
		normalized === "smallint" ||
		normalized.startsWith("smallint(") ||
		normalized === "tinyint" ||
		normalized.startsWith("tinyint(") ||
		normalized === "mediumint" ||
		normalized.startsWith("mediumint(") ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "float" ||
		normalized.startsWith("float(") ||
		normalized === "double" ||
		normalized.startsWith("double(")
	) {
		return DataType.number;
	}

	// Long string types (text variants, json)
	if (
		normalized === "text" ||
		normalized === "longtext" ||
		normalized === "mediumtext" ||
		normalized === "tinytext" ||
		normalized === "json"
	) {
		return DataType.long_text;
	}

	// Short string types (varchar, char, date/time, binary, etc.)
	if (
		normalized === "varchar" ||
		normalized.startsWith("varchar(") ||
		normalized === "char" ||
		normalized.startsWith("char(") ||
		normalized === "date" ||
		normalized === "time" ||
		normalized === "datetime" ||
		normalized === "timestamp" ||
		normalized === "year" ||
		normalized === "blob" ||
		normalized === "longblob" ||
		normalized === "mediumblob" ||
		normalized === "tinyblob" ||
		normalized === "binary" ||
		normalized === "varbinary"
	) {
		return DataType.short_text;
	}

	return DataType.short_text;
}
