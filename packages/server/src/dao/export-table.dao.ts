import type { Filter, Sort, SortDirection } from "shared/types";
import { getDbPool } from "@/db-manager.js";

const buildWhereClause = (
	filters: Filter[],
): { clause: string; values: unknown[] } => {
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
};

const buildSortClause = (
	sorts: Sort[] | string,
	order: SortDirection,
): string => {
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) {
			return "";
		}
		const sortParts = sorts.map(
			(sort) => `"${sort.columnName}" ${sort.direction.toUpperCase()}`,
		);
		return `ORDER BY ${sortParts.join(", ")}`;
	}

	if (sorts && typeof sorts === "string") {
		return `ORDER BY "${sorts}" ${order?.toUpperCase() || "ASC"}`;
	}

	return "";
};

export const exportTableData = async (
	tableName: string,
	sort: string | Sort[] = "",
	order: SortDirection = "asc",
	filters: Filter[] = [],
	database?: string,
): Promise<Record<string, unknown>[]> => {
	const sortClause = buildSortClause(
		Array.isArray(sort) ? sort : sort,
		order as SortDirection,
	);
	const { clause: whereClause, values: filterValues } =
		buildWhereClause(filters);

	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		// Get all data without pagination
		const dataRes = await client.query(
			`SELECT * FROM "${tableName}" ${whereClause} ${sortClause}`,
			filterValues,
		);

		const hasColumns = dataRes.fields && dataRes.fields.length > 0;
		const filteredData = hasColumns
			? dataRes.rows.filter((row) => Object.keys(row).length > 0)
			: dataRes.rows;

		return filteredData;
	} finally {
		client.release();
	}
};
