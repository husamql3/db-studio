import { db } from "../db.js";

export interface Filter {
	columnName: string;
	operator: string;
	value: string;
}

export interface TableDataResult {
	data: Record<string, unknown>[];
	meta: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}

const buildWhereClause = (filters: Filter[]): { clause: string; values: unknown[] } => {
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

export const getTableData = async (
	tableName: string,
	page: number = 1,
	pageSize: number = 50,
	sort: string = "",
	order: string = "asc",
	filters: Filter[] = [],
): Promise<TableDataResult> => {
	const sortClause = sort ? `ORDER BY "${sort}" ${order}` : "";
	const { clause: whereClause, values: filterValues } = buildWhereClause(filters);

	const client = await db.connect();
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

		return {
			data: dataRes.rows,
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
