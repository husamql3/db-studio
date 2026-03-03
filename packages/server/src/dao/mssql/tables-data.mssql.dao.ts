import type {
	DatabaseSchemaType,
	SortDirection,
	SortType,
	TableDataResultSchemaType,
} from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

export interface GetTableDataParams {
	tableName: string;
	cursor?: string;
	limit?: number;
	direction?: SortDirection;
	sort?: string | SortType[];
	order?: SortDirection;
	filters?: any[];
	db: DatabaseSchemaType["db"];
}

/**
 * Simplified implementation of getTableData for SQL Server
 * This version supports basic pagination with OFFSET/FETCH and simple sorting
 *
 * Note: A full implementation would include:
 * - Cursor-based pagination
 * - Complex filtering
 * - Multiple sort columns
 * - Foreign key relationships
 */
export const getTableData = async ({
	tableName,
	cursor = "",
	limit = 50,
	direction = "asc",
	sort = [],
	order = "asc",
	filters = [],
	db,
}: GetTableDataParams): Promise<TableDataResultSchemaType> => {
	const pool = await getMssqlPool(db);

	// Basic implementation: Use OFFSET/FETCH for pagination
	// Parse cursor as page number (simplified)
	const page = cursor ? Number.parseInt(cursor, 10) : 0;
	const offset = page * limit;

	// Build sort clause
	let sortClause = "";
	if (Array.isArray(sort) && sort.length > 0) {
		const sortParts = sort.map((s) => `[${s.columnName}] ${s.direction.toUpperCase()}`);
		sortClause = `ORDER BY ${sortParts.join(", ")}`;
	} else if (typeof sort === "string" && sort) {
		sortClause = `ORDER BY [${sort}] ${order.toUpperCase()}`;
	} else {
		// Default sort - use first column or (SELECT NULL)
		sortClause = "ORDER BY (SELECT NULL)";
	}

	// Get total count
	const countResult = await pool
		.request()
		.query(`SELECT COUNT(*) as total FROM [${tableName}]`);
	const totalRows = Number(countResult.recordset[0]?.total ?? 0);

	// Get paginated data
	const dataResult = await pool.request().query(`
		SELECT *
		FROM [${tableName}]
		${sortClause}
		OFFSET ${offset} ROWS
		FETCH NEXT ${limit + 1} ROWS ONLY
	`);

	let rows = dataResult.recordset as Record<string, unknown>[];
	const hasMore = rows.length > limit;

	if (hasMore) {
		rows = rows.slice(0, limit);
	}

	const nextCursor = hasMore ? String(page + 1) : null;
	const prevCursor = page > 0 ? String(page - 1) : null;

	return {
		data: rows,
		meta: {
			limit,
			total: totalRows,
			hasNextPage: hasMore,
			hasPreviousPage: page > 0,
			nextCursor,
			prevCursor,
		},
	};
};
