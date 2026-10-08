import { DataTypes } from "./column-info.types.js";

/**
 * Maps PostgreSQL data types to generic DataType enum
 */
export function mapPostgresToDataType(pgType: string): DataTypes {
	const normalized = pgType?.toLowerCase().trim() || "";

	// Handle array types and date/time types
	if (
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
		return DataTypes.date;
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
		return DataTypes.text;
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
		return DataTypes.text;
	}

	// Default to short for unrecognized types
	return DataTypes.text;
}

/**
 * Standardized data type labels
 */
export const StandardizedDataType = {
	// PostgreSQL numeric types
	int: "int",
	bigint: "bigint",
	smallint: "smallint",
	numeric: "numeric",
	float: "float",
	double: "double",
	money: "money",
	// MySQL numeric types
	tinyint: "tinyint",
	mediumint: "mediumint",
	bit: "bit",
	// Boolean
	boolean: "boolean",
	// Text types (shared)
	text: "text",
	varchar: "varchar",
	char: "char",
	// MySQL text types
	tinytext: "tinytext",
	mediumtext: "mediumtext",
	longtext: "longtext",
	// JSON types
	json: "json",
	jsonb: "jsonb",
	xml: "xml",
	// UUID
	uuid: "uuid",
	// Date/Time types (shared)
	date: "date",
	time: "time",
	timestamp: "timestamp",
	// PostgreSQL date/time
	timestamptz: "timestamptz",
	interval: "interval",
	// MySQL date/time
	datetime: "datetime",
	year: "year",
	// PostgreSQL binary/network/geometric types
	bytea: "bytea",
	inet: "inet",
	cidr: "cidr",
	macaddr: "macaddr",
	macaddr8: "macaddr8",
	point: "point",
	line: "line",
	polygon: "polygon",
	// MySQL binary types
	binary: "binary",
	varbinary: "varbinary",
	blob: "blob",
	tinyblob: "tinyblob",
	mediumblob: "mediumblob",
	longblob: "longblob",
	// Complex types (shared)
	array: "array",
	enum: "enum",
	// MySQL set type
	set: "set",
} as const;

export type StandardizedDataType =
	(typeof StandardizedDataType)[keyof typeof StandardizedDataType];

/**
 * Maps PostgreSQL data types to standardized display labels
 */
export function standardizeDataTypeLabel(
	pgType: string | null | undefined,
): StandardizedDataType {
	if (!pgType) {
		return StandardizedDataType.text; // Default fallback
	}
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

	if (normalized === "double precision" || normalized === "float8" || normalized === "float") {
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
	// todo: handle array types
	if (normalized.startsWith("array") || normalized.includes("[]")) {
		return StandardizedDataType.text;
	}

	// User-defined types (enums)
	if (normalized.startsWith("user-defined") || normalized === "enum") {
		return StandardizedDataType.enum;
	}

	// Default: return the original type
	return StandardizedDataType.text;
}

/**
 * Maps MySQL data types to generic DataType enum (used for cell rendering)
 * @param mysqlDataType - The DATA_TYPE field from information_schema.COLUMNS
 * @param columnType - The COLUMN_TYPE field (e.g., "tinyint(1)", "enum('a','b')") for finer mapping
 */
export function mapMysqlToDataType(mysqlDataType: string, columnType?: string): DataTypes {
	const normalized = mysqlDataType?.toLowerCase().trim() || "";
	const fullType = columnType?.toLowerCase().trim() || "";

	// tinyint(1) is MySQL's boolean convention
	if (normalized === "tinyint" && fullType === "tinyint(1)") {
		return DataTypes.boolean;
	}

	// Numeric types
	if (
		normalized === "tinyint" ||
		normalized === "smallint" ||
		normalized === "mediumint" ||
		normalized === "int" ||
		normalized === "integer" ||
		normalized === "bigint" ||
		normalized === "decimal" ||
		normalized === "numeric" ||
		normalized === "float" ||
		normalized === "double" ||
		normalized === "real" ||
		normalized === "bit"
	) {
		return DataTypes.number;
	}

	// Boolean (explicit)
	if (normalized === "boolean" || normalized === "bool") {
		return DataTypes.boolean;
	}

	// Date/time types
	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "timestamp" ||
		normalized === "time" ||
		normalized === "year"
	) {
		return DataTypes.date;
	}

	// JSON
	if (normalized === "json") {
		return DataTypes.json;
	}

	// Enum and set (set behaves like enum for display)
	if (normalized === "enum" || normalized === "set") {
		return DataTypes.enum;
	}

	// All text and binary types default to text
	return DataTypes.text;
}

/**
 * Maps MySQL data types to standardized display labels
 * @param mysqlDataType - The DATA_TYPE field from information_schema.COLUMNS
 * @param columnType - The COLUMN_TYPE field (e.g., "tinyint(1)") for finer mapping
 */
export function standardizeMysqlDataTypeLabel(
	mysqlDataType: string,
	columnType?: string,
): StandardizedDataType {
	if (!mysqlDataType) {
		return StandardizedDataType.text;
	}
	const normalized = mysqlDataType.toLowerCase().trim();
	const fullType = columnType?.toLowerCase().trim() || "";

	// tinyint(1) is MySQL's boolean convention
	if (normalized === "tinyint" && fullType === "tinyint(1)")
		return StandardizedDataType.boolean;

	// Numeric types
	if (normalized === "tinyint") return StandardizedDataType.tinyint;
	if (normalized === "smallint") return StandardizedDataType.smallint;
	if (normalized === "mediumint") return StandardizedDataType.mediumint;
	if (normalized === "int" || normalized === "integer") return StandardizedDataType.int;
	if (normalized === "bigint") return StandardizedDataType.bigint;
	if (normalized === "decimal" || normalized === "numeric")
		return StandardizedDataType.numeric;
	if (normalized === "float" || normalized === "real") return StandardizedDataType.float;
	if (normalized === "double") return StandardizedDataType.double;
	if (normalized === "bit") return StandardizedDataType.bit;

	// Boolean
	if (normalized === "boolean" || normalized === "bool") return StandardizedDataType.boolean;

	// Text types
	if (normalized === "char") return StandardizedDataType.char;
	if (normalized === "varchar") return StandardizedDataType.varchar;
	if (normalized === "tinytext") return StandardizedDataType.tinytext;
	if (normalized === "text") return StandardizedDataType.text;
	if (normalized === "mediumtext") return StandardizedDataType.mediumtext;
	if (normalized === "longtext") return StandardizedDataType.longtext;

	// Binary types
	if (normalized === "binary") return StandardizedDataType.binary;
	if (normalized === "varbinary") return StandardizedDataType.varbinary;
	if (normalized === "tinyblob") return StandardizedDataType.tinyblob;
	if (normalized === "blob") return StandardizedDataType.blob;
	if (normalized === "mediumblob") return StandardizedDataType.mediumblob;
	if (normalized === "longblob") return StandardizedDataType.longblob;

	// JSON
	if (normalized === "json") return StandardizedDataType.json;

	// Date/time types
	if (normalized === "date") return StandardizedDataType.date;
	if (normalized === "time") return StandardizedDataType.time;
	if (normalized === "datetime") return StandardizedDataType.datetime;
	if (normalized === "timestamp") return StandardizedDataType.timestamp;
	if (normalized === "year") return StandardizedDataType.year;

	// Complex types
	if (normalized === "enum") return StandardizedDataType.enum;
	if (normalized === "set") return StandardizedDataType.set;

	// Default
	return StandardizedDataType.text;
}

/**
 * Maps SQL Server data types to generic DataType enum (used for cell rendering)
 * @param mssqlDataType - The data type from sys.columns or information_schema.columns
 */
export function mapMssqlToDataType(mssqlDataType: string): DataTypes {
	const normalized = mssqlDataType?.toLowerCase().trim() || "";

	// Numeric types
	if (
		normalized === "tinyint" ||
		normalized === "smallint" ||
		normalized === "int" ||
		normalized === "bigint" ||
		normalized === "decimal" ||
		normalized === "numeric" ||
		normalized === "float" ||
		normalized === "real" ||
		normalized === "money" ||
		normalized === "smallmoney"
	) {
		return DataTypes.number;
	}

	// Boolean (bit with length 1)
	if (normalized === "bit") {
		return DataTypes.boolean;
	}

	// Date/time types
	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "datetime2" ||
		normalized === "smalldatetime" ||
		normalized === "time" ||
		normalized === "datetimeoffset"
	) {
		return DataTypes.date;
	}

	// JSON (SQL Server 2016+)
	if (normalized === "json") {
		return DataTypes.json;
	}

	// All text and binary types default to text
	return DataTypes.text;
}

/**
 * Maps SQL Server data types to standardized display labels
 * @param mssqlDataType - The data type from sys.columns or information_schema.columns
 */
export function standardizeMssqlDataTypeLabel(mssqlDataType: string): StandardizedDataType {
	if (!mssqlDataType) {
		return StandardizedDataType.text;
	}
	const normalized = mssqlDataType.toLowerCase().trim();

	// Numeric types
	if (normalized === "tinyint") return StandardizedDataType.tinyint;
	if (normalized === "smallint") return StandardizedDataType.smallint;
	if (normalized === "int") return StandardizedDataType.int;
	if (normalized === "bigint") return StandardizedDataType.bigint;
	if (normalized === "decimal" || normalized === "numeric")
		return StandardizedDataType.numeric;
	if (normalized === "float") return StandardizedDataType.float;
	if (normalized === "real") return StandardizedDataType.float;
	if (normalized === "money" || normalized === "smallmoney") return StandardizedDataType.money;

	// Boolean
	if (normalized === "bit") return StandardizedDataType.boolean;

	// Text types
	if (normalized === "char") return StandardizedDataType.char;
	if (normalized === "varchar") return StandardizedDataType.varchar;
	if (normalized === "text") return StandardizedDataType.text;
	if (normalized === "nchar") return StandardizedDataType.char;
	if (normalized === "nvarchar") return StandardizedDataType.varchar;
	if (normalized === "ntext") return StandardizedDataType.text;

	// Binary types
	if (normalized === "binary") return StandardizedDataType.binary;
	if (normalized === "varbinary") return StandardizedDataType.varbinary;
	if (normalized === "image") return StandardizedDataType.blob;

	// UUID
	if (normalized === "uniqueidentifier") return StandardizedDataType.uuid;

	// Date/time types
	if (normalized === "date") return StandardizedDataType.date;
	if (normalized === "time") return StandardizedDataType.time;
	if (normalized === "datetime") return StandardizedDataType.datetime;
	if (normalized === "datetime2") return StandardizedDataType.datetime;
	if (normalized === "smalldatetime") return StandardizedDataType.datetime;
	if (normalized === "datetimeoffset") return StandardizedDataType.timestamptz;

	// JSON and XML
	if (normalized === "json") return StandardizedDataType.json;
	if (normalized === "xml") return StandardizedDataType.xml;

	// Default
	return StandardizedDataType.text;
}

/**
 * Maps SQLite type affinity strings to generic DataTypes (used for cell rendering).
 * SQLite has flexible typing — column types are user-declared strings, so we use affinity rules.
 */
export function mapSqliteToDataType(sqliteType: string): DataTypes {
	const normalized = sqliteType?.toLowerCase().trim() || "";

	if (normalized === "boolean" || normalized === "bool") return DataTypes.boolean;
	if (normalized === "json") return DataTypes.json;

	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "timestamp" ||
		normalized === "time"
	) {
		return DataTypes.date;
	}

	// SQLite integer affinity: any type name containing "INT"
	if (
		normalized.includes("int") ||
		normalized === "real" ||
		normalized.includes("floa") ||
		normalized.includes("doub") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(")
	) {
		return DataTypes.number;
	}

	return DataTypes.text;
}

/**
 * Maps SQLite type strings to the standardized display labels used in ColumnInfoSchemaType.
 */
export function standardizeSqliteDataTypeLabel(sqliteType: string): StandardizedDataType {
	const normalized = sqliteType?.toLowerCase().trim() || "";

	if (normalized === "integer" || normalized === "int") return StandardizedDataType.int;
	if (normalized === "bigint" || normalized.startsWith("bigint("))
		return StandardizedDataType.bigint;
	if (normalized === "smallint" || normalized.startsWith("smallint("))
		return StandardizedDataType.smallint;
	if (normalized === "tinyint" || normalized.startsWith("tinyint("))
		return StandardizedDataType.tinyint;
	if (normalized === "mediumint" || normalized.startsWith("mediumint("))
		return StandardizedDataType.mediumint;
	if (normalized.includes("int")) return StandardizedDataType.int;

	if (normalized === "real" || normalized === "float" || normalized.startsWith("float("))
		return StandardizedDataType.float;
	if (
		normalized === "double" ||
		normalized === "double precision" ||
		normalized.startsWith("double(")
	)
		return StandardizedDataType.double;

	if (
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(")
	) {
		return StandardizedDataType.numeric;
	}

	if (normalized === "boolean" || normalized === "bool") return StandardizedDataType.boolean;

	if (normalized === "text" || normalized === "clob") return StandardizedDataType.text;
	if (normalized === "varchar" || normalized.startsWith("varchar("))
		return StandardizedDataType.varchar;
	if (normalized === "char" || normalized.startsWith("char("))
		return StandardizedDataType.char;

	if (normalized === "json") return StandardizedDataType.json;

	if (normalized === "date") return StandardizedDataType.date;
	if (normalized === "time") return StandardizedDataType.time;
	if (normalized === "datetime") return StandardizedDataType.datetime;
	if (normalized === "timestamp") return StandardizedDataType.timestamp;

	if (normalized === "blob") return StandardizedDataType.blob;

	return StandardizedDataType.text;
}

/**
 * Maps DuckDB column types (as reported by `duckdb_columns().data_type`) to generic DataTypes.
 * LIST, ARRAY, STRUCT, MAP and UNION values arrive as JSON, so they render as json cells.
 */
export function mapDuckdbToDataType(duckdbType: string): DataTypes {
	const normalized = duckdbType?.toLowerCase().trim() || "";

	if (
		normalized.endsWith("]") ||
		normalized.startsWith("struct") ||
		normalized.startsWith("map") ||
		normalized.startsWith("union") ||
		normalized === "json"
	) {
		return DataTypes.json;
	}
	if (normalized === "boolean" || normalized === "bool") return DataTypes.boolean;
	if (normalized.startsWith("enum")) return DataTypes.enum;
	if (normalized === "interval") return DataTypes.text;
	if (normalized === "date" || normalized.startsWith("time") || normalized === "datetime") {
		return DataTypes.date;
	}
	if (
		normalized.includes("int") ||
		normalized === "float" ||
		normalized === "real" ||
		normalized === "double" ||
		normalized.startsWith("decimal") ||
		normalized.startsWith("numeric") ||
		normalized === "bignum"
	) {
		return DataTypes.number;
	}

	return DataTypes.text;
}

/**
 * Maps DuckDB column types to the standardized display labels used in ColumnInfoSchemaType.
 */
export function standardizeDuckdbDataTypeLabel(duckdbType: string): StandardizedDataType {
	const normalized = duckdbType?.toLowerCase().trim() || "";

	if (normalized.endsWith("]")) return StandardizedDataType.array;
	if (
		normalized.startsWith("struct") ||
		normalized.startsWith("map") ||
		normalized.startsWith("union") ||
		normalized === "json"
	) {
		return StandardizedDataType.json;
	}
	if (normalized.startsWith("enum")) return StandardizedDataType.enum;
	if (normalized === "interval") return StandardizedDataType.interval;

	if (normalized === "tinyint" || normalized === "utinyint")
		return StandardizedDataType.tinyint;
	if (normalized === "smallint" || normalized === "usmallint")
		return StandardizedDataType.smallint;
	if (normalized === "integer" || normalized === "int") return StandardizedDataType.int;
	if (normalized.includes("int") || normalized === "bignum")
		return StandardizedDataType.bigint;
	if (normalized.startsWith("decimal") || normalized.startsWith("numeric"))
		return StandardizedDataType.numeric;
	if (normalized === "float" || normalized === "real") return StandardizedDataType.float;
	if (normalized === "double") return StandardizedDataType.double;

	if (normalized === "boolean" || normalized === "bool") return StandardizedDataType.boolean;
	if (normalized === "varchar" || normalized.startsWith("varchar("))
		return StandardizedDataType.varchar;
	if (normalized === "uuid") return StandardizedDataType.uuid;

	if (normalized === "date") return StandardizedDataType.date;
	if (normalized === "timestamp with time zone" || normalized === "timestamptz")
		return StandardizedDataType.timestamptz;
	if (normalized.startsWith("timestamp") || normalized === "datetime")
		return StandardizedDataType.timestamp;
	if (normalized.startsWith("time")) return StandardizedDataType.time;

	if (normalized === "blob" || normalized === "bytea") return StandardizedDataType.blob;
	if (normalized === "bit" || normalized === "bitstring") return StandardizedDataType.bit;

	return StandardizedDataType.text;
}

/**
 * Maps Oracle column types (as formatted from `USER_TAB_COLUMNS`, e.g. `NUMBER(10)`,
 * `TIMESTAMP(6) WITH TIME ZONE`) to generic DataTypes. Oracle DATE carries a time of day.
 */
export function mapOracleToDataType(oracleType: string): DataTypes {
	const normalized = oracleType?.toLowerCase().trim() || "";

	if (normalized === "boolean") return DataTypes.boolean;
	if (normalized === "json") return DataTypes.json;
	if (normalized === "date" || normalized.startsWith("timestamp")) return DataTypes.date;
	if (
		normalized.startsWith("number") ||
		normalized.startsWith("float") ||
		normalized === "integer" ||
		normalized === "binary_float" ||
		normalized === "binary_double"
	) {
		return DataTypes.number;
	}

	return DataTypes.text;
}

/**
 * Maps Oracle column types to the standardized display labels used in ColumnInfoSchemaType.
 */
export function standardizeOracleDataTypeLabel(oracleType: string): StandardizedDataType {
	const normalized = oracleType?.toLowerCase().trim() || "";

	if (normalized === "boolean") return StandardizedDataType.boolean;
	if (normalized === "json") return StandardizedDataType.json;
	if (normalized === "xmltype") return StandardizedDataType.xml;

	if (normalized === "integer") return StandardizedDataType.int;
	const integer = normalized.match(/^number\((\d+)(?:,0)?\)$/);
	if (integer) {
		const precision = Number(integer[1]);
		if (precision <= 4) return StandardizedDataType.smallint;
		if (precision <= 10) return StandardizedDataType.int;
		if (precision <= 19) return StandardizedDataType.bigint;
	}
	if (normalized.startsWith("number")) return StandardizedDataType.numeric;
	if (normalized === "binary_float") return StandardizedDataType.float;
	if (normalized === "binary_double" || normalized.startsWith("float"))
		return StandardizedDataType.double;

	if (normalized.startsWith("varchar") || normalized.startsWith("nvarchar"))
		return StandardizedDataType.varchar;
	if (normalized.startsWith("char") || normalized.startsWith("nchar"))
		return StandardizedDataType.char;

	if (normalized.startsWith("timestamp") && normalized.endsWith("time zone"))
		return StandardizedDataType.timestamptz;
	if (normalized === "date" || normalized.startsWith("timestamp"))
		return StandardizedDataType.timestamp;
	if (normalized.startsWith("interval")) return StandardizedDataType.interval;

	if (normalized === "blob" || normalized === "long raw") return StandardizedDataType.blob;
	if (normalized.startsWith("raw")) return StandardizedDataType.varbinary;

	return StandardizedDataType.text;
}
