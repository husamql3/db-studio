import type { FilterType, SortDirection } from "@db-studio/shared/types";

const quotePgIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function buildWhereClause(filters: FilterType[]): {
	clause: string;
	values: unknown[];
} {
	if (filters.length === 0) {
		return { clause: "", values: [] };
	}

	const conditions: string[] = [];
	const values: unknown[] = [];

	for (const filter of filters) {
		const paramIndex = values.length + 1;
		const columnName = quotePgIdent(filter.columnName);

		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${columnName} ${filter.operator} $${paramIndex}`);
				values.push(filter.value);
				break;
			case "is":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${columnName} IS NULL`);
				} else {
					conditions.push(`${columnName} = $${paramIndex}`);
					values.push(filter.value);
				}
				break;
			case "is not":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${columnName} IS NOT NULL`);
				} else {
					conditions.push(`${columnName} != $${paramIndex}`);
					values.push(filter.value);
				}
				break;
			case "like":
				conditions.push(`${columnName}::text LIKE $${paramIndex}`);
				values.push(filter.value);
				break;
			case "not like":
				conditions.push(`${columnName}::text NOT LIKE $${paramIndex}`);
				values.push(filter.value);
				break;
			case "ilike":
				conditions.push(`${columnName}::text ILIKE $${paramIndex}`);
				values.push(filter.value);
				break;
			case "not ilike":
				conditions.push(`${columnName}::text NOT ILIKE $${paramIndex}`);
				values.push(filter.value);
				break;
			default:
				break;
		}
	}

	if (conditions.length === 0) {
		return { clause: "", values: [] };
	}

	return { clause: `WHERE ${conditions.join(" AND ")}`, values };
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
			return `${quotePgIdent(term.column)} ${descending ? "DESC" : "ASC"} NULLS ${nullsLast ? "LAST" : "FIRST"}`;
		})
		.join(", ")}`;

/**
 * Rows after the `cursor` row in `buildOrderBy(terms, backward)` order:
 * `(c1 after v1) OR (c1 = v1 AND c2 after v2) OR …`, where "after" follows each column's own
 * direction and NULL placement. A row-value comparison `(c1, c2) > (v1, v2)` cannot express
 * mixed directions and never matches NULL. Each non-NULL cursor value is one parameter,
 * numbered from `startParamIndex`, that later branches reference again.
 */
export function buildKeysetPredicate(
	terms: OrderTerm[],
	cursor: Record<string, unknown>,
	backward: boolean,
	startParamIndex: number,
): { clause: string; values: unknown[] } {
	const branches: string[] = [];
	const equal: string[] = [];
	const values: unknown[] = [];

	for (const term of terms) {
		const col = quotePgIdent(term.column);
		const value = cursor[term.column] ?? null;
		const { descending, nullsLast } = placement(term, backward);
		if (value !== null) values.push(value);
		const param = `$${startParamIndex + values.length - 1}`;

		const after =
			value === null
				? nullsLast
					? null
					: `${col} IS NOT NULL`
				: `${col} ${descending ? "<" : ">"} ${param}${nullsLast ? ` OR ${col} IS NULL` : ""}`;
		if (after) branches.push(`(${[...equal, `(${after})`].join(" AND ")})`);

		equal.push(value === null ? `${col} IS NULL` : `${col} = ${param}`);
	}

	return { clause: branches.length ? `(${branches.join(" OR ")})` : "FALSE", values };
}

/**
 * Postgres resolves a bare table name through search_path, but catalog queries
 * filter on a literal schema and would otherwise disagree with the data queries
 * — the reason a table outside "public" used to list yet 404 on its columns.
 * The helpers below mirror Postgres' own resolution.
 */

/**
 * The single schema a bare table name resolves to, honouring search_path order
 * so a name present in several schemas picks the same one Postgres would.
 */
const resolvedSchemaFor = (tableParam: string): string =>
	`(SELECT sp.schema_name FROM unnest(current_schemas(false)) WITH ORDINALITY AS sp(schema_name, position)
	  JOIN information_schema.tables it
	    ON it.table_schema = sp.schema_name AND it.table_name = ${tableParam}
	  ORDER BY sp.position LIMIT 1)`;

/**
 * The schema of the table named by `tableParam`: the one in `schemaParam`, or the search_path
 * one when `schemaParam` is null. Pass `schemaName ?? null` as the schema value.
 */
export const schemaOf = (tableParam: string, schemaParam: string): string =>
	`COALESCE(${schemaParam}::text, ${resolvedSchemaFor(tableParam)})`;

/** `"schema"."table"`, or the bare `"table"`, which resolves through search_path. */
export const qualifiedTable = (tableName: string, schemaName?: string): string =>
	schemaName
		? `${quotePgIdent(schemaName)}.${quotePgIdent(tableName)}`
		: quotePgIdent(tableName);
