export const DataTypes = {
	short: "short",
	long: "long",
	boolean: "boolean",
	number: "number",
	enum: "enum",
	json: "json",
} as const;

export type DataTypes = (typeof DataTypes)[keyof typeof DataTypes];

/**
 * Maps PostgreSQL data types to generic DataType enum
 */
export function mapPostgresToDataType(pgType: string): DataTypes {
	const normalized = pgType.toLowerCase().trim();

	// Handle array types and date/time types
	if (
		normalized.startsWith("array") ||
		normalized.includes("[]") ||
		normalized === "date" ||
		normalized === "time" ||
		normalized === "time without time zone" ||
		normalized.startsWith("time(") ||
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(") ||
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(")
	) {
		return DataTypes.long;
	}

	// Numeric types
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
		return DataTypes.number;
	}

	// Boolean
	if (normalized === "boolean" || normalized === "bool") {
		return DataTypes.boolean;
	}

	// JSON types
	if (normalized === "json" || normalized === "jsonb") {
		return DataTypes.json;
	}

	// Enum types and long text types
	if (
		normalized.startsWith("user-defined") ||
		normalized === "enum" ||
		normalized === "text" ||
		normalized === "xml"
	) {
		return DataTypes.long;
	}

	// Short string types (varchar, char, uuid, etc.)
	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(") ||
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar" ||
		normalized === "uuid" ||
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
		return DataTypes.short;
	}

	// Default to short for unrecognized types
	return DataTypes.short;
}

/**
 * Standardized data type labels
 */
export const StandardizedDataType = {
	// Numeric types
	int: "int",
	bigint: "bigint",
	smallint: "smallint",
	numeric: "numeric",
	float: "float",
	double: "double",
	money: "money",
	// Boolean
	boolean: "boolean",
	// Text types
	text: "text",
	varchar: "varchar",
	char: "char",
	// JSON types
	json: "json",
	jsonb: "jsonb",
	xml: "xml",
	// UUID
	uuid: "uuid",
	// Date/Time types
	date: "date",
	time: "time",
	timestamp: "timestamp",
	timestamptz: "timestamptz",
	interval: "interval",
	// Binary
	bytea: "bytea",
	// Network types
	inet: "inet",
	cidr: "cidr",
	macaddr: "macaddr",
	macaddr8: "macaddr8",
	// Geometric types
	point: "point",
	line: "line",
	polygon: "polygon",
	// Complex types
	array: "array",
	enum: "enum",
} as const;

export type StandardizedDataType =
	(typeof StandardizedDataType)[keyof typeof StandardizedDataType];

/**
 * Maps PostgreSQL data types to standardized display labels
 */
export function standardizeDataTypeLabel(pgType: string): StandardizedDataType {
	const normalized = pgType.toLowerCase().trim();

	// Numeric types
	if (
		normalized === "integer" ||
		normalized === "int" ||
		normalized === "int4" ||
		normalized === "serial" ||
		normalized === "serial4"
	) {
		return StandardizedDataType.int;
	}

	if (
		normalized === "bigint" ||
		normalized === "int8" ||
		normalized === "bigserial" ||
		normalized === "serial8"
	) {
		return StandardizedDataType.bigint;
	}

	if (normalized === "smallint" || normalized === "int2") {
		return StandardizedDataType.smallint;
	}

	if (
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(")
	) {
		return StandardizedDataType.numeric;
	}

	if (normalized === "real" || normalized === "float4") {
		return StandardizedDataType.float;
	}

	if (
		normalized === "double precision" ||
		normalized === "float8" ||
		normalized === "float"
	) {
		return StandardizedDataType.double;
	}

	if (normalized === "money") {
		return StandardizedDataType.money;
	}

	// Boolean
	if (normalized === "boolean" || normalized === "bool") {
		return StandardizedDataType.boolean;
	}

	// Text types
	if (normalized === "text") {
		return StandardizedDataType.text;
	}

	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(")
	) {
		return StandardizedDataType.varchar;
	}

	if (
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar"
	) {
		return StandardizedDataType.char;
	}

	// JSON types
	if (normalized === "json") {
		return StandardizedDataType.json;
	}

	if (normalized === "jsonb") {
		return StandardizedDataType.jsonb;
	}

	if (normalized === "xml") {
		return StandardizedDataType.xml;
	}

	// UUID
	if (normalized === "uuid") {
		return StandardizedDataType.uuid;
	}

	// Date/Time types
	if (normalized === "date") {
		return StandardizedDataType.date;
	}

	if (
		normalized === "time" ||
		normalized === "time without time zone" ||
		normalized.startsWith("time(")
	) {
		return StandardizedDataType.time;
	}

	if (
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(")
	) {
		return StandardizedDataType.timestamp;
	}

	if (
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(")
	) {
		return StandardizedDataType.timestamptz;
	}

	if (normalized === "interval" || normalized.startsWith("interval")) {
		return StandardizedDataType.interval;
	}

	// Binary
	if (normalized === "bytea") {
		return StandardizedDataType.bytea;
	}

	// Network types
	if (normalized === "inet") {
		return StandardizedDataType.inet;
	}

	if (normalized === "cidr") {
		return StandardizedDataType.cidr;
	}

	if (normalized === "macaddr") {
		return StandardizedDataType.macaddr;
	}

	if (normalized === "macaddr8") {
		return StandardizedDataType.macaddr8;
	}

	// Geometric types
	if (normalized === "point") {
		return StandardizedDataType.point;
	}

	if (normalized === "line") {
		return StandardizedDataType.line;
	}

	if (normalized === "polygon") {
		return StandardizedDataType.polygon;
	}

	// Array types
	if (normalized.startsWith("array") || normalized.includes("[]")) {
		return StandardizedDataType.array;
	}

	// User-defined types (enums)
	if (normalized.startsWith("user-defined") || normalized === "enum") {
		return StandardizedDataType.enum;
	}

	// Default: return the original type
	return StandardizedDataType.text;
}
