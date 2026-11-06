import { DataTypes, StandardizedDataType } from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import { HTTPException } from "@/http-exception.js";

/**
 * Quote an identifier exactly as stored. Oracle folds unquoted names to uppercase, so every
 * name is quoted. Quoted Oracle identifiers cannot contain `"` at all (there is no escape),
 * so such a name is rejected instead of escaped.
 */
export const quoteOracleIdent = (name: string) => {
	if (name.includes('"') || name.includes("\0"))
		throw new HTTPException(400, {
			message: `Oracle identifiers cannot contain double quotes: ${name}`,
		});

	return `"${name}"`;
};

export const oraclePlaceholder = (position: number) => `:${position}`;

type OracleTemporalType = "date" | "timestamp" | "timestampTz" | "timestampLtz";

const ORACLE_DATE_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS';
const ORACLE_TIMESTAMP_FORMAT = `${ORACLE_DATE_FORMAT}.FF9`;
const ORACLE_TIMESTAMP_TZ_FORMAT = `${ORACLE_TIMESTAMP_FORMAT}TZH:TZM`;

const ISO_DATE =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const temporalTypeOf = (columnType: string): OracleTemporalType | null => {
	const type = columnType.toUpperCase();

	if (type === "DATE") return "date";

	if (!type.startsWith("TIMESTAMP")) return null;

	if (type.includes("WITH LOCAL TIME ZONE")) return "timestampLtz";

	if (type.includes("WITH TIME ZONE")) return "timestampTz";

	return "timestamp";
};

const temporalFormatOf = (columnType: string | undefined) => {
	const temporalType = columnType ? temporalTypeOf(columnType) : null;

	if (temporalType === "date") return ORACLE_DATE_FORMAT;

	if (temporalType === "timestampTz") return ORACLE_TIMESTAMP_TZ_FORMAT;

	if (temporalType) return ORACLE_TIMESTAMP_FORMAT;

	return null;
};

const formatTemporalColumn = (column: string, columnType: string | undefined) => {
	const format = temporalFormatOf(columnType);

	return format ? `TO_CHAR(${column}, '${format}')` : column;
};

const normalizeTemporalValue = (value: unknown, temporalType: OracleTemporalType) => {
	const input = value instanceof Date ? value.toISOString() : value;

	if (typeof input !== "string")
		throw new HTTPException(400, { message: `Invalid Oracle ${temporalType} value` });
	const match = input.trim().match(ISO_DATE);

	if (!match)
		throw new HTTPException(400, {
			message: `Invalid Oracle date or timestamp value: ${input}`,
		});

	const [, year, month, day, hour = "00", minute = "00", second = "00", fraction = "", zone] =
		match;

	const wallClock = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

	if (temporalType === "date") return wallClock;
	const timestamp = `${wallClock}.${fraction.padEnd(9, "0")}`;

	if (temporalType === "timestamp") return timestamp;

	if (!zone || zone.toUpperCase() === "Z") return `${timestamp}+00:00`;
	const compactZone = zone.replace(":", "");

	return `${timestamp}${compactZone.slice(0, 3)}:${compactZone.slice(3).padEnd(2, "0")}`;
};

export const bindOracleValue = (
	value: unknown,
	columnType: string | undefined,
	bind: (boundValue: unknown) => string,
) => {
	const temporalType = columnType ? temporalTypeOf(columnType) : null;

	if (!temporalType) return bind(value);

	const placeholder = bind(
		value === null || value === undefined ? null : normalizeTemporalValue(value, temporalType),
	);

	if (temporalType === "date") return `TO_DATE(${placeholder}, '${ORACLE_DATE_FORMAT}')`;

	if (temporalType === "timestamp")
		return `TO_TIMESTAMP(${placeholder}, '${ORACLE_TIMESTAMP_FORMAT}')`;

	return `TO_TIMESTAMP_TZ(${placeholder}, '${ORACLE_TIMESTAMP_TZ_FORMAT}')`;
};

export const buildOracleSelectList = (
	columns: Array<{ COLUMN_NAME: string; DATA_TYPE: string }>,
	tableAlias?: string,
) =>
	columns
		.map(({ COLUMN_NAME: name, DATA_TYPE: dataType }) => {
			const column = `${tableAlias ? `${tableAlias}.` : ""}${quoteOracleIdent(name)}`;
			const projected = formatTemporalColumn(column, dataType);

			return projected === column ? column : `${projected} AS ${quoteOracleIdent(name)}`;
		})
		.join(", ");

/**
 * Comparisons bind through `bindOracleValue`, so a temporal value gets an explicit format;
 * LIKE compares the canonical string a table read returns.
 */
export const oracleFilters = (
	columnTypes: ReadonlyMap<string, string>,
	bind: (value: unknown) => string,
): FilterDialect => ({
	quote: quoteOracleIdent,
	likeOperand: (column, columnName) =>
		formatTemporalColumn(column, columnTypes.get(columnName)),
	ilike: "upper",
	bindComparison: (value, columnName) =>
		bindOracleValue(value, columnTypes.get(columnName), bind),
});

/**
 * Translate a PostgreSQL type name from the web form into an Oracle column type.
 * `text` becomes VARCHAR2(4000), not CLOB: a CLOB column cannot be compared with `=`, sorted,
 * indexed, made UNIQUE or later altered from VARCHAR2, which the grid does with every text
 * column. Values over 4000 bytes are rejected (ORA-12899) instead.
 * `native` is true on Oracle 23ai and later, which have SQL BOOLEAN and JSON types.
 */
export function mapColumnTypeToOracle(
	columnType: string,
	isArray: boolean,
	native: boolean,
): string {
	if (isArray)
		throw new HTTPException(400, {
			message:
				"Oracle has no array column type. Use a json column (JSON on Oracle 23ai) instead.",
		});

	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> = {
		serial: "NUMBER(10)",
		serial4: "NUMBER(10)",
		bigserial: "NUMBER(19)",
		serial8: "NUMBER(19)",
		smallserial: "NUMBER(5)",
		serial2: "NUMBER(5)",
		int: "NUMBER(10)",
		int4: "NUMBER(10)",
		integer: "NUMBER(10)",
		bigint: "NUMBER(19)",
		int8: "NUMBER(19)",
		smallint: "NUMBER(5)",
		int2: "NUMBER(5)",
		tinyint: "NUMBER(3)",
		numeric: "NUMBER",
		decimal: "NUMBER",
		real: "BINARY_FLOAT",
		float4: "BINARY_FLOAT",
		float: "BINARY_DOUBLE",
		"double precision": "BINARY_DOUBLE",
		float8: "BINARY_DOUBLE",
		money: "NUMBER(19,4)",
		boolean: native ? "BOOLEAN" : "NUMBER(1)",
		bool: native ? "BOOLEAN" : "NUMBER(1)",
		text: "VARCHAR2(4000)",
		varchar: "VARCHAR2(255)",
		"character varying": "VARCHAR2(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR(1)",
		uuid: "VARCHAR2(36)",
		json: native ? "JSON" : "CLOB",
		jsonb: native ? "JSON" : "CLOB",
		xml: "CLOB",
		date: "DATE",
		time: "VARCHAR2(18)",
		"time without time zone": "VARCHAR2(18)",
		timestamp: "TIMESTAMP",
		"timestamp without time zone": "TIMESTAMP",
		"timestamp with time zone": "TIMESTAMP WITH TIME ZONE",
		timestamptz: "TIMESTAMP WITH TIME ZONE",
		interval: "INTERVAL DAY TO SECOND",
		bytea: "BLOB",
		inet: "VARCHAR2(45)",
		cidr: "VARCHAR2(45)",
		macaddr: "VARCHAR2(17)",
		macaddr8: "VARCHAR2(23)",
		point: "VARCHAR2(4000)",
		line: "VARCHAR2(4000)",
		polygon: "VARCHAR2(4000)",
	};

	return typeMap[normalized] ?? columnType.toUpperCase();
}

/** Translate the common PostgreSQL default expressions the web form offers. */
export function formatOracleDefault(defaultValue: string, native: boolean): string {
	const trimmed = defaultValue.trim();
	const lower = trimmed.toLowerCase();

	if (lower === "now()" || lower === "current_timestamp") return "CURRENT_TIMESTAMP";

	if (lower === "current_date") return "CURRENT_DATE";

	if (lower === "true" || lower === "false") {
		if (native) return lower.toUpperCase();

		return lower === "true" ? "1" : "0";
	}

	return trimmed;
}

export const IDENTITY_CLAUSE = "GENERATED BY DEFAULT ON NULL AS IDENTITY";

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
