import type { CursorData, FilterType, SortDirection, SortType } from "shared/types";

/**
 * MySQL-specific WHERE clause builder.
 * Uses ? placeholders and backtick identifiers.
 * ILIKE/NOT ILIKE map to LIKE/NOT LIKE (MySQL is case-insensitive by default on most collations).
 */
export function buildWhereClauseMysql(filters: FilterType[]): {
	clause: string;
	values: unknown[];
} {
	if (filters.length === 0) {
		return { clause: "", values: [] };
	}

	const conditions: string[] = [];
	const values: unknown[] = [];

	for (const filter of filters) {
		const columnName = `\`${filter.columnName}\``;

		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${columnName} ${filter.operator} ?`);
				values.push(filter.value);
				break;
			case "is":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${columnName} IS NULL`);
				} else {
					conditions.push(`${columnName} = ?`);
					values.push(filter.value);
				}
				break;
			case "is not":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${columnName} IS NOT NULL`);
				} else {
					conditions.push(`${columnName} != ?`);
					values.push(filter.value);
				}
				break;
			case "like":
			case "ilike":
				// MySQL LIKE is case-insensitive by default on most collations
				conditions.push(`${columnName} LIKE ?`);
				values.push(filter.value);
				break;
			case "not like":
			case "not ilike":
				conditions.push(`${columnName} NOT LIKE ?`);
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

/**
 * MySQL-specific ORDER BY clause builder.
 * Uses backtick identifiers.
 */
export function buildSortClauseMysql(
	sorts: SortType[] | string,
	order: SortDirection,
): string {
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) {
			return "";
		}
		const sortParts = sorts.map(
			(sort) => `\`${sort.columnName}\` ${sort.direction.toUpperCase()}`,
		);
		return `ORDER BY ${sortParts.join(", ")}`;
	}

	if (sorts && typeof sorts === "string") {
		return `ORDER BY \`${sorts}\` ${order?.toUpperCase() || "ASC"}`;
	}

	return "";
}

/**
 * MySQL-specific cursor WHERE clause builder.
 * Uses ? placeholders (no index tracking needed since all placeholders are ?).
 */
export function buildCursorWhereClauseMysql(
	cursorData: CursorData,
	direction: SortDirection,
	sortDirection: SortDirection,
): { clause: string; values: unknown[] } {
	const { values, sortColumns } = cursorData;
	const conditions: string[] = [];
	const queryValues: unknown[] = [];

	const isAscending = sortDirection === "asc";
	const isForward = direction === "asc";
	const useGreaterThan = isAscending === isForward;

	if (sortColumns.length > 0) {
		const columnList = sortColumns.map((col) => `\`${col}\``).join(", ");
		const placeholders = sortColumns.map(() => "?").join(", ");
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
