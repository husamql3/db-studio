import {
	DataTypes,
	isSerialType,
	StandardizedDataType,
	type FormColumnType,
} from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";

export const quoteClickhouseIdentifier = (name: string): string =>
	`\`${name.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;

const q = quoteClickhouseIdentifier;

/**
 * Filter values bind as positional `{pN:String}` parameters: ClickHouse converts a
 * string operand to the column's type for comparisons. LIKE needs a string column,
 * so it compares the column's text form.
 */
export const clickhouseFilters: FilterDialect = {
	quote: quoteClickhouseIdentifier,
	likeOperand: (column) => `toString(${column})`,
	ilike: "keyword",
};

export const clickhousePlaceholder = (position: number) => `{p${position - 1}:String}`;

/** Postgres types (from the web form) to ClickHouse. Unknown names pass through as native ClickHouse types. */
function mapColumnTypeToClickhouse(
	columnType: string,
	isArray: boolean,
	supportsJsonType: boolean,
): string {
	const typeMap: Record<string, string | undefined> &
		Record<FormColumnType, string | undefined> = {
		smallserial: "UInt16",
		serial2: "UInt16",
		serial: "UInt32",
		serial4: "UInt32",
		bigserial: "UInt64",
		serial8: "UInt64",
		tinyint: "Int8",
		smallint: "Int16",
		int2: "Int16",
		int: "Int32",
		int4: "Int32",
		integer: "Int32",
		bigint: "Int64",
		int8: "Int64",
		numeric: "Decimal(38, 10)",
		decimal: "Decimal(38, 10)",
		money: "Decimal(19, 4)",
		real: "Float32",
		float4: "Float32",
		float: "Float64",
		float8: "Float64",
		"double precision": "Float64",
		boolean: "Bool",
		bool: "Bool",
		text: "String",
		varchar: "String",
		"character varying": "String",
		char: "String",
		character: "String",
		bpchar: "String",
		citext: "String",
		uuid: "UUID",
		json: supportsJsonType ? "JSON" : "String",
		jsonb: supportsJsonType ? "JSON" : "String",
		xml: "String",
		date: "Date32",
		time: "String",
		"time without time zone": "String",
		timestamp: "DateTime64(6)",
		"timestamp without time zone": "DateTime64(6)",
		timestamptz: "DateTime64(6, 'UTC')",
		"timestamp with time zone": "DateTime64(6, 'UTC')",
		interval: "String",
		bytea: "String",
		inet: "String",
		cidr: "String",
		macaddr: "String",
		macaddr8: "String",
		// No ClickHouse type is mapped for these; the name passes through unchanged.
		point: undefined,
		line: undefined,
		polygon: undefined,
	};

	const base = typeMap[columnType.toLowerCase().trim()] ?? columnType.trim();

	return isArray ? `Array(${base})` : base;
}

const DEFAULT_FUNCTIONS: Record<string, string> = {
	"now()": "now()",
	current_timestamp: "now()",
	"current_timestamp()": "now()",
	current_date: "today()",
	"gen_random_uuid()": "generateUUIDv4()",
	"uuid_generate_v4()": "generateUUIDv4()",
};

type ClickhouseColumnInput = {
	columnName: string;
	columnType: string;
	isArray?: boolean;
	isNullable?: boolean;
	isPrimaryKey?: boolean;
	isIdentity?: boolean;
	defaultValue?: string | null;
};

/**
 * Identity and serial columns become `UInt64 DEFAULT generateSnowflakeID()`:
 * ClickHouse has no auto-increment, and Snowflake IDs are unique and grow in
 * insertion order.
 */
export function buildClickhouseColumnDefinition(
	field: ClickhouseColumnInput,
	supportsJsonType: boolean,
): string {
	const name = q(field.columnName);

	if (field.isIdentity || isSerialType(field.columnType)) {
		return `${name} UInt64 DEFAULT generateSnowflakeID()`;
	}

	const type = mapColumnTypeToClickhouse(
		field.columnType,
		field.isArray ?? false,
		supportsJsonType,
	);

	const nullable = field.isNullable && !field.isPrimaryKey && !field.isArray;
	let def = `${name} ${nullable ? `Nullable(${type})` : type}`;

	const defaultValue = field.defaultValue?.trim();

	if (defaultValue) {
		def += ` DEFAULT ${DEFAULT_FUNCTIONS[defaultValue.toLowerCase()] ?? defaultValue}`;
	}

	return def;
}

/** Strips the `Nullable(...)` and `LowCardinality(...)` wrappers, which do not change how a value renders. */
export function unwrapClickhouseType(clickhouseType: string): string {
	let type = clickhouseType.trim();

	for (;;) {
		const match = type.match(/^(?:Nullable|LowCardinality)\((.*)\)$/);

		if (!match?.[1]) return type;
		type = match[1].trim();
	}
}

/**
 * Maps ClickHouse column types (as reported by `system.columns.type`) to generic DataTypes.
 */
export function mapClickhouseToDataType(clickhouseType: string): DataTypes {
	const type = unwrapClickhouseType(clickhouseType);

	if (type.startsWith("Array(")) return DataTypes.array;

	if (type.startsWith("Enum8(") || type.startsWith("Enum16(")) return DataTypes.enum;

	if (type === "Bool") return DataTypes.boolean;

	if (/^(Date|Date32|DateTime|DateTime64|Time|Time64)\b/.test(type)) return DataTypes.date;

	if (/^(U?Int\d+|Float\d+|BFloat16|Decimal\d*)\b/.test(type)) return DataTypes.number;

	if (/^(JSON|Object|Map|Tuple|Variant|Dynamic|Nested)\b/.test(type)) return DataTypes.json;

	return DataTypes.text;
}

export function standardizeClickhouseDataTypeLabel(
	clickhouseType: string,
): StandardizedDataType {
	const type = unwrapClickhouseType(clickhouseType);

	if (type.startsWith("Array(")) return StandardizedDataType.array;

	if (type.startsWith("Enum8(") || type.startsWith("Enum16("))
		return StandardizedDataType.enum;

	if (type === "Bool") return StandardizedDataType.boolean;

	if (/^U?Int8$/.test(type)) return StandardizedDataType.tinyint;

	if (/^U?Int16$/.test(type)) return StandardizedDataType.smallint;

	if (/^U?Int32$/.test(type)) return StandardizedDataType.int;

	if (/^U?Int(64|128|256)$/.test(type)) return StandardizedDataType.bigint;

	if (type === "Float32" || type === "BFloat16") return StandardizedDataType.float;

	if (type === "Float64") return StandardizedDataType.double;

	if (type.startsWith("Decimal")) return StandardizedDataType.numeric;

	if (type.startsWith("FixedString(")) return StandardizedDataType.char;

	if (type === "UUID") return StandardizedDataType.uuid;

	if (type === "IPv4" || type === "IPv6") return StandardizedDataType.inet;

	if (type === "Date" || type === "Date32") return StandardizedDataType.date;

	if (type.startsWith("DateTime64")) return StandardizedDataType.timestamp;

	if (type.startsWith("DateTime")) return StandardizedDataType.datetime;

	if (type.startsWith("Time")) return StandardizedDataType.time;

	if (/^(JSON|Object|Map|Tuple|Variant|Dynamic|Nested)\b/.test(type))
		return StandardizedDataType.json;

	return StandardizedDataType.text;
}
