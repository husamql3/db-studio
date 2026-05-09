import type { CursorData, FilterType, SortDirection, SortType } from "@db-studio/shared/types";

export function buildWhereClause(filters: FilterType[]): {
	clause: string;
	values: unknown[];
} {
	if (!filters.length) return { clause: "", values: [] };

	const conditions: string[] = [];
	const values: unknown[] = [];

	for (const filter of filters) {
		const col = `"${filter.columnName}"`;
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
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NULL`);
				} else {
					conditions.push(`${col} = ?`);
					values.push(filter.value);
				}
				break;
			case "is not":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NOT NULL`);
				} else {
					conditions.push(`${col} != ?`);
					values.push(filter.value);
				}
				break;
			case "like":
				conditions.push(`CAST(${col} AS TEXT) LIKE ?`);
				values.push(filter.value);
				break;
			case "not like":
				conditions.push(`CAST(${col} AS TEXT) NOT LIKE ?`);
				values.push(filter.value);
				break;
			case "ilike":
				conditions.push(`CAST(${col} AS TEXT) LIKE ? COLLATE NOCASE`);
				values.push(filter.value);
				break;
			case "not ilike":
				conditions.push(`CAST(${col} AS TEXT) NOT LIKE ? COLLATE NOCASE`);
				values.push(filter.value);
				break;
			default:
				break;
		}
	}

	if (!conditions.length) return { clause: "", values: [] };
	return { clause: `WHERE ${conditions.join(" AND ")}`, values };
}

export function buildSortClause(sorts: SortType[] | string, order: SortDirection): string {
	if (Array.isArray(sorts)) {
		if (!sorts.length) return "";
		return `ORDER BY ${sorts.map((s) => `"${s.columnName}" ${s.direction.toUpperCase()}`).join(", ")}`;
	}
	if (sorts && typeof sorts === "string") {
		return `ORDER BY "${sorts}" ${order?.toUpperCase() || "ASC"}`;
	}
	return "";
}

/**
 * Builds cursor WHERE clause using SQLite row-value comparison (supported since 3.15.0).
 * Uses `?` positional placeholders.
 */
export function buildCursorWhereClause(
	cursorData: CursorData,
	direction: SortDirection,
	sortDirection: SortDirection,
): { clause: string; values: unknown[] } {
	const { values, sortColumns } = cursorData;
	if (!sortColumns.length) return { clause: "", values: [] };

	const isAscending = sortDirection === "asc";
	const isForward = direction === "asc";
	const useGreaterThan = isAscending === isForward;
	const operator = useGreaterThan ? ">" : "<";

	const columnList = sortColumns.map((col) => `"${col}"`).join(", ");
	const placeholders = sortColumns.map(() => "?").join(", ");
	const queryValues = sortColumns.map((col) => values[col]);

	return {
		clause: `(${columnList}) ${operator} (${placeholders})`,
		values: queryValues,
	};
}
