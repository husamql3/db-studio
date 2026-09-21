import type { CursorData, FilterType, SortDirection, SortType } from "@db-studio/shared/types";

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
		const columnName = `"${filter.columnName}"`;

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

export function buildSortClause(sorts: SortType[] | string, order: SortDirection): string {
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) return "";
		const parts = sorts.map((s) => `"${s.columnName}" ${s.direction.toUpperCase()}`);
		return `ORDER BY ${parts.join(", ")}`;
	}
	if (sorts && typeof sorts === "string") {
		return `ORDER BY "${sorts}" ${order?.toUpperCase() || "ASC"}`;
	}
	return "";
}

export function buildCursorWhereClause(
	cursorData: CursorData,
	direction: SortDirection,
	sortDirection: SortDirection,
	startParamIndex: number,
): { clause: string; values: unknown[] } {
	const { values, sortColumns } = cursorData;
	const conditions: string[] = [];
	const queryValues: unknown[] = [];

	const isAscending = sortDirection === "asc";
	const isForward = direction === "asc";
	const useGreaterThan = isAscending === isForward;

	if (sortColumns.length > 0) {
		const columnList = sortColumns.map((col) => `"${col}"`).join(", ");
		const placeholders = sortColumns.map((_, i) => `$${startParamIndex + i}`).join(", ");
		const operator = useGreaterThan ? ">" : "<";
		conditions.push(`(${columnList}) ${operator} (${placeholders})`);
		for (const col of sortColumns) {
			queryValues.push(values[col]);
		}
	}

	return {
		clause: conditions.length > 0 ? `(${conditions.join(" AND ")})` : "",
		values: queryValues,
	};
}

/**
 * Postgres resolves a bare table name through search_path, but catalog queries
 * filter on a literal schema and would otherwise disagree with the data queries
 * — the reason a table outside "public" used to list yet 404 on its columns.
 * Both helpers below mirror Postgres' own resolution.
 */

/** Every schema on the current search_path. Use for EXISTS-style checks. */
export const SEARCH_PATH_SCHEMAS = "ANY(current_schemas(false))";

/**
 * The single schema a bare table name resolves to, honouring search_path order
 * so a name present in several schemas picks the same one Postgres would.
 */
export const resolvedSchemaFor = (tableParam: string): string =>
	`(SELECT sp.schema_name FROM unnest(current_schemas(false)) WITH ORDINALITY AS sp(schema_name, position)
	  JOIN information_schema.tables it
	    ON it.table_schema = sp.schema_name AND it.table_name = ${tableParam}
	  ORDER BY sp.position LIMIT 1)`;
