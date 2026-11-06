import { DataTypes, StandardizedDataType, type FormColumnType } from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import type { KeysetDialect } from "@/adapters/sql-pagination.js";

export const quoteDuckdbIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export const duckdbFilters: FilterDialect = {
	quote: quoteDuckdbIdent,
	likeOperand: (column) => `CAST(${column} AS VARCHAR)`,
	ilike: "keyword",
};

export const duckdbKeyset: KeysetDialect = { quote: quoteDuckdbIdent, nulls: "keyword" };

/** Translate a PostgreSQL type name from the web form into a DuckDB column type. */
export function mapColumnTypeToDuckdb(columnType: string, isArray: boolean): string {
	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> & Record<FormColumnType, string> = {
		serial: "INTEGER",
		serial4: "INTEGER",
		bigserial: "BIGINT",
		serial8: "BIGINT",
		smallserial: "SMALLINT",
		serial2: "SMALLINT",
		int: "INTEGER",
		int4: "INTEGER",
		integer: "INTEGER",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		numeric: "DECIMAL(18, 3)",
		decimal: "DECIMAL(18, 3)",
		real: "FLOAT",
		float4: "FLOAT",
		float: "DOUBLE",
		"double precision": "DOUBLE",
		float8: "DOUBLE",
		money: "DECIMAL(19, 4)",
		boolean: "BOOLEAN",
		bool: "BOOLEAN",
		text: "VARCHAR",
		varchar: "VARCHAR",
		"character varying": "VARCHAR",
		char: "VARCHAR",
		character: "VARCHAR",
		bpchar: "VARCHAR",
		uuid: "UUID",
		json: "JSON",
		jsonb: "JSON",
		xml: "VARCHAR",
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "TIMESTAMP",
		"timestamp without time zone": "TIMESTAMP",
		"timestamp with time zone": "TIMESTAMPTZ",
		timestamptz: "TIMESTAMPTZ",
		interval: "INTERVAL",
		bytea: "BLOB",
		inet: "VARCHAR",
		cidr: "VARCHAR",
		macaddr: "VARCHAR",
		macaddr8: "VARCHAR",
		point: "VARCHAR",
		line: "VARCHAR",
		polygon: "VARCHAR",
	};

	const mapped = typeMap[normalized] ?? columnType.toUpperCase();

	return isArray ? `${mapped}[]` : mapped;
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
