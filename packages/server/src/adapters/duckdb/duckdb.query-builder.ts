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

/** NULLs sort last in either direction; a backward page reads that order reversed. */
const placement = (term: OrderTerm, backward: boolean) => ({
	descending: (term.direction === "desc") !== backward,
	nullsLast: !backward,
});

export const buildOrderBy = (terms: OrderTerm[], backward = false) =>
	`ORDER BY ${terms
		.map((term) => {
			const { descending, nullsLast } = placement(term, backward);
			return `${quoteDuckdbIdent(term.column)} ${descending ? "DESC" : "ASC"} NULLS ${nullsLast ? "LAST" : "FIRST"}`;
		})
		.join(", ")}`;

/**
 * Rows after the `cursor` row in `buildOrderBy(terms, backward)` order:
 * `(c1 after v1) OR (c1 = v1 AND c2 after v2) OR …`, where "after" follows each column's own
 * direction and NULL placement. A row-value comparison `(c1, c2) > (v1, v2)` cannot express
 * mixed directions and never matches NULL.
 */
export function buildKeysetPredicate(
	terms: OrderTerm[],
	cursor: Record<string, unknown>,
	backward: boolean,
): { clause: string; values: unknown[] } {
	const branches: string[] = [];
	const values: unknown[] = [];
	const equal: string[] = [];
	const equalValues: unknown[] = [];

	for (const term of terms) {
		const col = quoteDuckdbIdent(term.column);
		const value = cursor[term.column] ?? null;
		const { descending, nullsLast } = placement(term, backward);

		const after =
			value === null
				? nullsLast
					? null
					: `${col} IS NOT NULL`
				: `${col} ${descending ? "<" : ">"} ?${nullsLast ? ` OR ${col} IS NULL` : ""}`;
		if (after) {
			branches.push(`(${[...equal, `(${after})`].join(" AND ")})`);
			values.push(...equalValues, ...(value === null ? [] : [value]));
		}

		if (value === null) {
			equal.push(`${col} IS NULL`);
		} else {
			equal.push(`${col} = ?`);
			equalValues.push(value);
		}
	}

	return { clause: branches.length ? `(${branches.join(" OR ")})` : "FALSE", values };
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
