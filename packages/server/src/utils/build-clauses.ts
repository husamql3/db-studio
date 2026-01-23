import type { Filter, Sort, SortDirection } from "shared/types/index.js";

export function buildWhereClause(filters: Filter[]): {
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

export function buildSortClause(
	sorts: Sort[] | string,
	order: SortDirection,
): string {
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
