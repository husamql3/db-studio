import type { CursorData, FilterType, SortDirection, SortType } from "shared/types";

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
				// Handle NULL values
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
				// Unknown operator, skip
				break;
		}
	}

	if (conditions.length === 0) {
		return { clause: "", values: [] };
	}

	return { clause: `WHERE ${conditions.join(" AND ")}`, values };
}

export function buildSortClause(sorts: SortType[] | string, order: SortDirection): string {
	// Handle array of Sort objects (new format for referenced tables)
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) {
			return "";
		}
		const sortParts = sorts.map(
			(sort) => `"${sort.columnName}" ${sort.direction.toUpperCase()}`,
		);
		return `ORDER BY ${sortParts.join(", ")}`;
	}

	// Handle legacy format (string column name + order)
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

	// Determine comparison operator based on direction and sort order
	// Forward + ASC = >, Forward + DESC = <
	// Backward + ASC = <, Backward + DESC = >
	const isAscending = sortDirection === "asc";
	const isForward = direction === "asc";
	const useGreaterThan = isAscending === isForward;

	// Build row comparison for multi-column cursor
	// Uses tuple comparison: (col1, col2, ...) > (val1, val2, ...)
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
