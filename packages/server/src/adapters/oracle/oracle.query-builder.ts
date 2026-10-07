import type { FilterType, SortDirection } from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";

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

/** Collects positional binds and returns the `:n` placeholder for each value. */
export const createBinds = () => {
	const values: unknown[] = [];
	const bind = (value: unknown) => {
		values.push(value);
		return `:${values.length}`;
	};
	return { values, bind };
};

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

export type OracleForeignKeyRow = {
	CONSTRAINT_NAME: string;
	REFERENCING_TABLE: string;
	REFERENCING_COLUMN: string;
	REFERENCED_TABLE: string;
	REFERENCED_COLUMN: string;
};

export type OracleForeignKey = {
	constraintName: string;
	referencingTable: string;
	columns: string[];
	referencedTable: string;
	referencedColumns: string[];
};

export const groupOracleForeignKeys = (rows: OracleForeignKeyRow[]): OracleForeignKey[] => {
	const constraints = new Map<string, OracleForeignKey>();
	for (const row of rows) {
		const existing = constraints.get(row.CONSTRAINT_NAME);
		if (existing) {
			existing.columns.push(row.REFERENCING_COLUMN);
			existing.referencedColumns.push(row.REFERENCED_COLUMN);
			continue;
		}
		constraints.set(row.CONSTRAINT_NAME, {
			constraintName: row.CONSTRAINT_NAME,
			referencingTable: row.REFERENCING_TABLE,
			columns: [row.REFERENCING_COLUMN],
			referencedTable: row.REFERENCED_TABLE,
			referencedColumns: [row.REFERENCED_COLUMN],
		});
	}
	return [...constraints.values()];
};

export const whereSql = (conditions: string[]) =>
	conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

export function buildFilterConditions(
	filters: FilterType[],
	bind: (value: unknown) => string,
	columnTypes: ReadonlyMap<string, string>,
): string[] {
	const conditions: string[] = [];

	for (const filter of filters) {
		const col = quoteOracleIdent(filter.columnName);
		const columnType = columnTypes.get(filter.columnName);
		const isNull = filter.value.toLowerCase() === "null";
		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(
					`${col} ${filter.operator} ${bindOracleValue(filter.value, columnType, bind)}`,
				);
				break;
			case "is":
				conditions.push(
					isNull
						? `${col} IS NULL`
						: `${col} = ${bindOracleValue(filter.value, columnType, bind)}`,
				);
				break;
			case "is not":
				conditions.push(
					isNull
						? `${col} IS NOT NULL`
						: `${col} != ${bindOracleValue(filter.value, columnType, bind)}`,
				);
				break;
			case "like":
				conditions.push(`${formatTemporalColumn(col, columnType)} LIKE ${bind(filter.value)}`);
				break;
			case "not like":
				conditions.push(
					`${formatTemporalColumn(col, columnType)} NOT LIKE ${bind(filter.value)}`,
				);
				break;
			case "ilike":
				conditions.push(
					`UPPER(${formatTemporalColumn(col, columnType)}) LIKE UPPER(${bind(filter.value)})`,
				);
				break;
			case "not ilike":
				conditions.push(
					`UPPER(${formatTemporalColumn(col, columnType)}) NOT LIKE UPPER(${bind(filter.value)})`,
				);
				break;
		}
	}

	return conditions;
}

/** One ORDER BY term; `column: null` orders by ROWID, the tie-breaker for tables without a key. */
export interface OrderTerm {
	column: string | null;
	direction: SortDirection;
}

export const buildOrderBy = (terms: OrderTerm[], tableAlias?: string) =>
	`ORDER BY ${terms
		.map(
			(t) =>
				`${tableAlias ? `${tableAlias}.` : ""}${t.column === null ? "ROWID" : quoteOracleIdent(t.column)} ${t.direction.toUpperCase()}`,
		)
		.join(", ")}`;

const SERIAL_TYPES = new Set([
	"serial",
	"serial4",
	"bigserial",
	"serial8",
	"smallserial",
	"serial2",
]);

export const isSerialType = (columnType: string) =>
	SERIAL_TYPES.has(columnType.toLowerCase().trim());

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
