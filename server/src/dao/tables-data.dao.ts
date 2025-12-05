import { db } from "../db.js";

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

export const getTableData = async (
	tableName: string,
	page: number = 1,
	pageSize: number = 50,
	sort: string = "",
	order: string = "asc",
): Promise<TableDataResult> => {
	const sortClause = sort ? `ORDER BY "${sort}" ${order}` : "";
	console.log("sortClause", sortClause);
	const client = await db.connect();
	try {
		// Calculate offset
		const offset = (page - 1) * pageSize;

		// Get total count
		const countRes = await client.query(`SELECT COUNT(*) as total FROM "${tableName}"`);
		const totalRows = Number(countRes.rows[0].total);
		const totalPages = Math.ceil(totalRows / pageSize);

		// Get paginated data
		const dataRes = await client.query(
			`SELECT * FROM "${tableName}" ${sortClause} LIMIT $1 OFFSET $2`,
			[pageSize, offset],
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
