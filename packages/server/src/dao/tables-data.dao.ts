import type {
	CursorData,
	DatabaseSchemaType,
	FilterType,
	SortDirection,
	SortType,
	TableDataResultSchemaType,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";
import {
	buildCursorWhereClause,
	buildSortClause,
	buildWhereClause,
} from "@/utils/build-clauses.js";

// Encode cursor data to base64 string
const encodeCursor = (data: CursorData): string => {
	return Buffer.from(JSON.stringify(data)).toString("base64url");
};

// Decode base64 cursor string to cursor data
const decodeCursor = (cursor: string): CursorData | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
	} catch {
		return null;
	}
};

// Get primary key column(s) for a table
const getPrimaryKeyColumns = async (
	pool: ReturnType<typeof getDbPool>,
	tableName: string,
): Promise<string[]> => {
	// Quote the table name to preserve case sensitivity in PostgreSQL
	const quotedTableName = `"${tableName}"`;
	const result = await pool.query(
		`SELECT a.attname as column_name
		 FROM pg_index i
		 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
		 WHERE i.indrelid = $1::regclass AND i.indisprimary
		 ORDER BY array_position(i.indkey, a.attnum)`,
		[quotedTableName],
	);
	return result.rows.map((row) => row.column_name);
};

export interface GetTableDataParams {
	tableName: string;
	cursor?: string;
	limit?: number;
	direction?: SortDirection;
	sort?: string | SortType[];
	order?: SortDirection;
	filters?: FilterType[];
	db: DatabaseSchemaType["db"];
}

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
	const pool = getDbPool(db);

	// Get primary key columns for stable cursor pagination
	const primaryKeyColumns = await getPrimaryKeyColumns(pool, tableName);

	// Determine sort columns - use provided sort or fall back to primary key
	let sortColumns: string[] = [];
	let effectiveSortDirection: SortDirection = order;

	if (Array.isArray(sort) && sort.length > 0) {
		sortColumns = sort.map((s) => s.columnName);
		effectiveSortDirection = sort[0].direction;
	} else if (typeof sort === "string" && sort) {
		sortColumns = [sort];
	}
	// Always include primary key columns for stable pagination
	const cursorColumns = [
		...sortColumns,
		...primaryKeyColumns.filter((pk) => !sortColumns.includes(pk)),
	];

	// If no sort columns and no primary key, fall back to ctid (PostgreSQL internal row id)
	if (cursorColumns.length === 0) {
		cursorColumns.push("ctid");
	}
	// Build filter WHERE clause
	const { clause: filterWhereClause, values: filterValues } = buildWhereClause(filters);
	// Build cursor WHERE clause if cursor is provided
	let cursorWhereClause = "";
	let cursorValues: unknown[] = [];

	if (cursor) {
		const cursorData = decodeCursor(cursor);
		if (cursorData) {
			const cursorResult = buildCursorWhereClause(
				cursorData,
				direction,
				effectiveSortDirection,
				filterValues.length + 1,
			);
			cursorWhereClause = cursorResult.clause;
			cursorValues = cursorResult.values;
		}
	}
	// Combine WHERE clauses
	let combinedWhereClause = "";
	if (filterWhereClause && cursorWhereClause) {
		// Remove "WHERE " prefix from filterWhereClause and combine
		const filterCondition = filterWhereClause.replace(/^WHERE\s+/i, "");
		combinedWhereClause = `WHERE ${filterCondition} AND ${cursorWhereClause}`;
	} else if (filterWhereClause) {
		combinedWhereClause = filterWhereClause;
	} else if (cursorWhereClause) {
		combinedWhereClause = `WHERE ${cursorWhereClause}`;
	}

	// Build sort clause
	const sortClause = buildSortClause(Array.isArray(sort) ? sort : sort, order);

	// For backward pagination, reverse the sort order
	let effectiveSortClause = sortClause;
	if (direction === "desc") {
		if (sortClause) {
			effectiveSortClause = sortClause
				.replace(/\bASC\b/gi, "TEMP_DESC")
				.replace(/\bDESC\b/gi, "ASC")
				.replace(/TEMP_DESC/g, "DESC");
		} else {
			// Default sort by cursor columns in reverse
			const reverseSortParts = cursorColumns.map(
				(col) => `"${col}" ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`,
			);
			effectiveSortClause = `ORDER BY ${reverseSortParts.join(", ")}`;
		}
	} else if (!sortClause && cursorColumns.length > 0) {
		// Default sort by cursor columns
		const defaultSortParts = cursorColumns.map(
			(col) => `"${col}" ${effectiveSortDirection.toUpperCase()}`,
		);
		effectiveSortClause = `ORDER BY ${defaultSortParts.join(", ")}`;
	}

	// Get total count (with filters only, not cursor)
	const countRes = await pool.query(
		`SELECT COUNT(*) as total FROM "${tableName}" ${filterWhereClause}`,
		filterValues,
	);
	const totalRows = Number(countRes.rows[0].total);
	// Fetch one extra row to determine if there are more results
	const limitParamIndex = filterValues.length + cursorValues.length + 1;
	const dataRes = await pool.query(
		`SELECT * FROM "${tableName}" ${combinedWhereClause} ${effectiveSortClause} LIMIT $${limitParamIndex}`,
		[...filterValues, ...cursorValues, limit + 1],
	);
	// Check if table has columns
	const hasColumns = dataRes.fields && dataRes.fields.length > 0;
	// Filter out empty objects
	let rows = hasColumns
		? dataRes.rows.filter((row) => Object.keys(row).length > 0)
		: dataRes.rows;
	// Determine if there are more results
	const hasMore = rows.length > limit;
	if (hasMore) {
		rows = rows.slice(0, limit);
	}
	// For backward pagination, reverse the results to maintain correct order
	if (direction === "desc") {
		rows = rows.reverse();
	}
	// Build cursors for next/previous pages
	let nextCursor: string | null = null;
	let prevCursor: string | null = null;
	if (rows.length > 0) {
		const firstRow = rows[0];
		const lastRow = rows[rows.length - 1];
		// Create cursor from row values
		const createCursorFromRow = (row: Record<string, unknown>): CursorData => ({
			values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
			sortColumns: cursorColumns,
		});
		// For forward pagination
		if (direction === "asc") {
			// Next cursor: if there are more results, encode the last row
			if (hasMore) {
				nextCursor = encodeCursor(createCursorFromRow(lastRow));
			}
			// Previous cursor: if we used a cursor to get here, encode the first row
			if (cursor) {
				prevCursor = encodeCursor(createCursorFromRow(firstRow));
			}
		} else {
			// For backward pagination
			// Next cursor: if we used a cursor, encode the last row (to go forward again)
			if (cursor) {
				nextCursor = encodeCursor(createCursorFromRow(lastRow));
			}
			// Previous cursor: if there are more results going backward, encode the first row
			if (hasMore) {
				prevCursor = encodeCursor(createCursorFromRow(firstRow));
			}
		}
	}
	return {
		data: rows,
		meta: {
			limit,
			total: totalRows,
			hasNextPage: direction === "asc" ? hasMore : !!cursor,
			hasPreviousPage: direction === "asc" ? !!cursor : hasMore,
			nextCursor,
			prevCursor,
		},
	};
};
