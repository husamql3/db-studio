import type {
	Filter,
	Sort,
	SortDirection,
	TableDataResult,
} from "shared/types";
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
};

const buildSortClause = (
	sorts: Sort[] | string,
	order: SortDirection,
): string => {
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
};

export const getTableData = async (
	tableName: string,
	page: number = 1,
	pageSize: number = 50,
	sort: string | Sort[] = "",
	order: SortDirection = "asc",
	filters: Filter[] = [],
	database?: string,
): Promise<TableDataResult> => {
	const sortClause = buildSortClause(
		Array.isArray(sort) ? sort : sort,
		order as SortDirection,
	);
	const { clause: whereClause, values: filterValues } =
		buildWhereClause(filters);

	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		// Calculate offset
		const offset = (page - 1) * pageSize;

		// Get total count (with filters)
		const countRes = await client.query(
			`SELECT COUNT(*) as total FROM "${tableName}" ${whereClause}`,
			filterValues,
		);
		const totalRows = Number(countRes.rows[0].total);
		const totalPages = Math.ceil(totalRows / pageSize);

		// Get paginated data (with filters)
		// Parameter indices continue after filter values
		const limitParamIndex = filterValues.length + 1;
		const offsetParamIndex = filterValues.length + 2;

		const dataRes = await client.query(
			`SELECT * FROM "${tableName}" ${whereClause} ${sortClause} LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
			[...filterValues, pageSize, offset],
		);

		// Filter out empty objects (rows with no columns)
		const filteredData = dataRes.rows.filter(
			(row) => Object.keys(row).length > 0,
		);

		return {
			data: filteredData,
			meta: {
				page,
				limit: pageSize,
				total: totalRows,
				totalPages,
				hasNextPage: page < totalPages,
				hasPreviousPage: page > 1,
			},
		};
	} finally {
		client.release();
	}
};
