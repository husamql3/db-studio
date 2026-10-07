import type { FilterType, SortDirection } from "@db-studio/shared/types";

export const quoteDuckdbIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export const whereSql = (conditions: string[]) =>
	conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

export function buildFilterConditions(filters: FilterType[]): {
	conditions: string[];
	values: unknown[];
} {
	const conditions: string[] = [];
	const values: unknown[] = [];

	for (const filter of filters) {
		const col = quoteDuckdbIdent(filter.columnName);
		const isNull = filter.value.toLowerCase() === "null";
		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${col} ${filter.operator} ?`);
				values.push(filter.value);
				break;
			case "is":
				if (isNull) {
					conditions.push(`${col} IS NULL`);
				} else {
					conditions.push(`${col} = ?`);
					values.push(filter.value);
				}
				break;
			case "is not":
				if (isNull) {
					conditions.push(`${col} IS NOT NULL`);
				} else {
					conditions.push(`${col} != ?`);
					values.push(filter.value);
				}
				break;
			case "like":
			case "not like":
			case "ilike":
			case "not ilike":
				conditions.push(`CAST(${col} AS VARCHAR) ${filter.operator.toUpperCase()} ?`);
				values.push(filter.value);
				break;
		}
	}

	return { conditions, values };
}

export interface OrderTerm {
	column: string;
	direction: SortDirection;
}

export const buildOrderBy = (terms: OrderTerm[]) =>
	`ORDER BY ${terms.map((t) => `${quoteDuckdbIdent(t.column)} ${t.direction.toUpperCase()}`).join(", ")}`;

/**
 * Keyset predicate `(a, b) > (CAST(? AS T1), CAST(? AS T2))`. DuckDB binds a row-value
 * comparison's parameters as VARCHAR and refuses to compare STRUCT(DATE, …) with
 * STRUCT(VARCHAR, …), so every cursor value is cast to its column's type.
 */
export function buildCursorWhereClause(
	columns: Array<{ name: string; type: string }>,
	values: Record<string, unknown>,
	operator: ">" | "<",
): { clause: string; values: unknown[] } {
	return {
		clause: `(${columns.map((c) => quoteDuckdbIdent(c.name)).join(", ")}) ${operator} (${columns.map((c) => `CAST(? AS ${c.type})`).join(", ")})`,
		values: columns.map((c) => values[c.name]),
	};
}

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

/** Translate a PostgreSQL type name from the web form into a DuckDB column type. */
export function mapColumnTypeToDuckdb(columnType: string, isArray: boolean): string {
	const normalized = columnType.toLowerCase().trim();
	const typeMap: Record<string, string> = {
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
