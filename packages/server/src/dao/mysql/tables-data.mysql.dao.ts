import type { RowDataPacket } from "mysql2";
import type {
	CursorData,
	DatabaseSchemaType,
	FilterType,
	SortDirection,
	SortType,
	TableDataResultSchemaType,
} from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import {
	buildCursorWhereClauseMysql,
	buildSortClauseMysql,
	buildWhereClauseMysql,
} from "@/utils/build-clauses-mysql.js";

const encodeCursor = (data: CursorData): string => {
	return Buffer.from(JSON.stringify(data)).toString("base64url");
};

const decodeCursor = (cursor: string): CursorData | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
	} catch {
		return null;
	}
};

const getPrimaryKeyColumns = async (
	pool: ReturnType<typeof getMysqlPool>,
	tableName: string,
): Promise<string[]> => {
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT COLUMN_NAME as column_name
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE()
		   AND TABLE_NAME = ?
		   AND COLUMN_KEY = 'PRI'
		 ORDER BY ORDINAL_POSITION`,
		[tableName],
	);
	return (rows as Array<{ column_name: string }>).map((row) => row.column_name);
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
	const pool = getMysqlPool(db);

	const primaryKeyColumns = await getPrimaryKeyColumns(pool, tableName);

	let sortColumns: string[] = [];
	let effectiveSortDirection: SortDirection = order;

	if (Array.isArray(sort) && sort.length > 0) {
		sortColumns = sort.map((s) => s.columnName);
		effectiveSortDirection = sort[0].direction;
	} else if (typeof sort === "string" && sort) {
		sortColumns = [sort];
	}

	const cursorColumns = [
		...sortColumns,
		...primaryKeyColumns.filter((pk) => !sortColumns.includes(pk)),
	];

	// MySQL has no ctid equivalent — if no cursor columns, use empty (rely on natural order)
	const { clause: filterWhereClause, values: filterValues } = buildWhereClauseMysql(filters);

	let cursorWhereClause = "";
	let cursorValues: unknown[] = [];

	if (cursor) {
		const cursorData = decodeCursor(cursor);
		if (cursorData) {
			const cursorResult = buildCursorWhereClauseMysql(
				cursorData,
				direction,
				effectiveSortDirection,
			);
			cursorWhereClause = cursorResult.clause;
			cursorValues = cursorResult.values;
		}
	}

	let combinedWhereClause = "";
	if (filterWhereClause && cursorWhereClause) {
		const filterCondition = filterWhereClause.replace(/^WHERE\s+/i, "");
		combinedWhereClause = `WHERE ${filterCondition} AND ${cursorWhereClause}`;
	} else if (filterWhereClause) {
		combinedWhereClause = filterWhereClause;
	} else if (cursorWhereClause) {
		combinedWhereClause = `WHERE ${cursorWhereClause}`;
	}

	const sortClause = buildSortClauseMysql(Array.isArray(sort) ? sort : sort, order);

	let effectiveSortClause = sortClause;
	if (direction === "desc") {
		if (sortClause) {
			effectiveSortClause = sortClause
				.replace(/\bASC\b/gi, "TEMP_DESC")
				.replace(/\bDESC\b/gi, "ASC")
				.replace(/TEMP_DESC/g, "DESC");
		} else if (cursorColumns.length > 0) {
			const reverseSortParts = cursorColumns.map(
				(col) => `\`${col}\` ${effectiveSortDirection === "asc" ? "DESC" : "ASC"}`,
			);
			effectiveSortClause = `ORDER BY ${reverseSortParts.join(", ")}`;
		}
	} else if (!sortClause && cursorColumns.length > 0) {
		const defaultSortParts = cursorColumns.map(
			(col) => `\`${col}\` ${effectiveSortDirection.toUpperCase()}`,
		);
		effectiveSortClause = `ORDER BY ${defaultSortParts.join(", ")}`;
	}

	const [countRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as total FROM \`${tableName}\` ${filterWhereClause}`,
		// biome-ignore lint/suspicious/noExplicitAny: mysql2 execute doesn't accept unknown[]
		filterValues as any,
	);
	const totalRows = Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);

	const fetchLimit = Math.floor(limit) + 1;
	const [dataRows] = await pool.execute<RowDataPacket[]>(
		`SELECT * FROM \`${tableName}\` ${combinedWhereClause} ${effectiveSortClause} LIMIT ${fetchLimit}`,
		// biome-ignore lint/suspicious/noExplicitAny: mysql2 execute doesn't accept unknown[]
		[...filterValues, ...cursorValues] as any,
	);

	let rows = dataRows as Record<string, unknown>[];

	const hasMore = rows.length > limit;
	if (hasMore) {
		rows = rows.slice(0, limit);
	}

	if (direction === "desc") {
		rows = rows.reverse();
	}

	let nextCursor: string | null = null;
	let prevCursor: string | null = null;

	if (rows.length > 0 && cursorColumns.length > 0) {
		const firstRow = rows[0];
		const lastRow = rows[rows.length - 1];

		const createCursorFromRow = (row: Record<string, unknown>): CursorData => ({
			values: Object.fromEntries(cursorColumns.map((col) => [col, row[col]])),
			sortColumns: cursorColumns,
		});

		if (direction === "asc") {
			if (hasMore) {
				nextCursor = encodeCursor(createCursorFromRow(lastRow));
			}
			if (cursor) {
				prevCursor = encodeCursor(createCursorFromRow(firstRow));
			}
		} else {
			if (cursor) {
				nextCursor = encodeCursor(createCursorFromRow(lastRow));
			}
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
