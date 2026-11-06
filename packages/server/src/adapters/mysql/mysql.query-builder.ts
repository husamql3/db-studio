import { DataTypes, StandardizedDataType } from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import type { KeysetDialect } from "@/adapters/sql-pagination.js";

export const quoteMysqlIdent = (name: string) => `\`${name.replaceAll("`", "``")}\``;

export const mysqlFilters: FilterDialect = { quote: quoteMysqlIdent, ilike: "like" };

/** MySQL has no `NULLS LAST`; it orders by `col IS NULL` first instead. */
export const mysqlKeyset: KeysetDialect = { quote: quoteMysqlIdent, nulls: "is-null" };

type MysqlColumnDefinitionInput = {
	columnName: string;
	columnType: string;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	isNullable?: boolean;
	isUnique?: boolean;
	isIdentity?: boolean;
	isArray?: boolean;
};

type BuildMysqlColumnDefinitionOptions = {
	includePrimaryKey?: boolean;
	includeUnique?: boolean;
	preserveAutoIncrement?: boolean;
};

export function mapColumnTypeToMysql(columnType: string, isArray: boolean): string {
	if (isArray) return "JSON";
	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> = {
		serial: "INT AUTO_INCREMENT",
		serial4: "INT AUTO_INCREMENT",
		bigserial: "BIGINT AUTO_INCREMENT",
		serial8: "BIGINT AUTO_INCREMENT",
		int: "INT",
		int4: "INT",
		integer: "INT",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		numeric: "DECIMAL",
		decimal: "DECIMAL",
		real: "FLOAT",
		float4: "FLOAT",
		float: "FLOAT",
		"double precision": "DOUBLE",
		float8: "DOUBLE",
		money: "DECIMAL(19, 4)",
		boolean: "TINYINT(1)",
		bool: "TINYINT(1)",
		text: "LONGTEXT",
		varchar: "VARCHAR(255)",
		"character varying": "VARCHAR(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR",
		uuid: "CHAR(36)",
		json: "JSON",
		jsonb: "JSON",
		xml: "LONGTEXT",
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "DATETIME",
		"timestamp without time zone": "DATETIME",
		"timestamp with time zone": "DATETIME",
		timestamptz: "DATETIME",
		interval: "VARCHAR(255)",
		bytea: "LONGBLOB",
		inet: "VARCHAR(45)",
		cidr: "VARCHAR(45)",
		macaddr: "VARCHAR(17)",
		macaddr8: "VARCHAR(23)",
		point: "POINT",
		line: "LINESTRING",
		polygon: "POLYGON",
	};

	return typeMap[normalized] || columnType.toUpperCase();
}

export function formatMysqlDefaultValue(
	defaultValue: string | null | undefined,
	columnType: string,
): string | null {
	if (!defaultValue?.trim()) return null;
	const trimmed = defaultValue.trim().toLowerCase();

	if (trimmed.includes("(") && trimmed.includes(")")) {
		if (trimmed.includes("uuid()")) {
			if (
				!columnType.toUpperCase().includes("CHAR") &&
				!columnType.toUpperCase().includes("TEXT")
			) {
				return null;
			}

			return "(UUID())";
		}

		if (trimmed.includes("current_timestamp") || trimmed.includes("now()"))
			return "(CURRENT_TIMESTAMP)";

		if (trimmed.includes("current_date")) return "(CURRENT_DATE)";

		return `(${defaultValue.trim()})`;
	}

	if (trimmed === "null") return "NULL";

	if (trimmed === "true") return "1";

	if (trimmed === "false") return "0";

	return defaultValue.trim();
}

export function buildMysqlColumnDefinition(
	field: MysqlColumnDefinitionInput,
	options: BuildMysqlColumnDefinitionOptions = {},
): string {
	const mappedType = mapColumnTypeToMysql(field.columnType, field.isArray ?? false);
	let def = `${quoteMysqlIdent(field.columnName)} ${mappedType}`;

	if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

	if (field.defaultValue && !mappedType.includes("AUTO_INCREMENT")) {
		const dv = formatMysqlDefaultValue(field.defaultValue, mappedType);

		if (dv !== null) def += ` DEFAULT ${dv}`;
	}

	if (
		(field.isIdentity || options.preserveAutoIncrement) &&
		!mappedType.includes("AUTO_INCREMENT")
	) {
		def += " AUTO_INCREMENT";
	}

	if (options.includeUnique && field.isUnique && !field.isPrimaryKey) def += " UNIQUE";

	if (options.includePrimaryKey && field.isPrimaryKey) def += " PRIMARY KEY";

	return def;
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

	if (normalized === "boolean" || normalized === "bool") {
		return DataTypes.boolean;
	}

	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "timestamp" ||
		normalized === "time" ||
		normalized === "year"
	) {
		return DataTypes.date;
	}

	if (normalized === "json") {
		return DataTypes.json;
	}

	// Enum and set (set behaves like enum for display)
	if (normalized === "enum" || normalized === "set") {
		return DataTypes.enum;
	}

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

	if (normalized === "boolean" || normalized === "bool") return StandardizedDataType.boolean;

	if (normalized === "char") return StandardizedDataType.char;

	if (normalized === "varchar") return StandardizedDataType.varchar;

	if (normalized === "tinytext") return StandardizedDataType.tinytext;

	if (normalized === "text") return StandardizedDataType.text;

	if (normalized === "mediumtext") return StandardizedDataType.mediumtext;

	if (normalized === "longtext") return StandardizedDataType.longtext;

	if (normalized === "binary") return StandardizedDataType.binary;

	if (normalized === "varbinary") return StandardizedDataType.varbinary;

	if (normalized === "tinyblob") return StandardizedDataType.tinyblob;

	if (normalized === "blob") return StandardizedDataType.blob;

	if (normalized === "mediumblob") return StandardizedDataType.mediumblob;

	if (normalized === "longblob") return StandardizedDataType.longblob;

	if (normalized === "json") return StandardizedDataType.json;

	if (normalized === "date") return StandardizedDataType.date;

	if (normalized === "time") return StandardizedDataType.time;

	if (normalized === "datetime") return StandardizedDataType.datetime;

	if (normalized === "timestamp") return StandardizedDataType.timestamp;

	if (normalized === "year") return StandardizedDataType.year;

	if (normalized === "enum") return StandardizedDataType.enum;

	if (normalized === "set") return StandardizedDataType.set;

	return StandardizedDataType.text;
}
