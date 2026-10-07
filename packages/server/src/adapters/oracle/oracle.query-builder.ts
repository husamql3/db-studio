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

export const whereSql = (conditions: string[]) =>
	conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

export function buildFilterConditions(
	filters: FilterType[],
	bind: (value: unknown) => string,
): string[] {
	const conditions: string[] = [];

	for (const filter of filters) {
		const col = quoteOracleIdent(filter.columnName);
		const isNull = filter.value.toLowerCase() === "null";
		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${col} ${filter.operator} ${bind(filter.value)}`);
				break;
			case "is":
				conditions.push(isNull ? `${col} IS NULL` : `${col} = ${bind(filter.value)}`);
				break;
			case "is not":
				conditions.push(isNull ? `${col} IS NOT NULL` : `${col} != ${bind(filter.value)}`);
				break;
			case "like":
				conditions.push(`${col} LIKE ${bind(filter.value)}`);
				break;
			case "not like":
				conditions.push(`${col} NOT LIKE ${bind(filter.value)}`);
				break;
			case "ilike":
				conditions.push(`UPPER(${col}) LIKE UPPER(${bind(filter.value)})`);
				break;
			case "not ilike":
				conditions.push(`UPPER(${col}) NOT LIKE UPPER(${bind(filter.value)})`);
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

export const buildOrderBy = (terms: OrderTerm[]) =>
	`ORDER BY ${terms
		.map(
			(t) =>
				`${t.column === null ? "ROWID" : quoteOracleIdent(t.column)} ${t.direction.toUpperCase()}`,
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
