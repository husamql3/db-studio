import type { TableInfo } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const getTablesList = async (
	database?: string,
): Promise<TableInfo[]> => {
	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		// First get all table names
		const tablesRes = await client.query(`
      SELECT table_name as "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

		// Get accurate row count for each table
		const tables: TableInfo[] = await Promise.all(
			tablesRes.rows.map(async (row: { tableName: string }) => {
				try {
					const countRes = await client.query(
						`SELECT COUNT(*) as count FROM "${row.tableName}"`,
					);
					return {
						tableName: row.tableName,
						rowCount: Number(countRes.rows[0].count),
					};
				} catch {
					// If count fails (e.g., table has no columns), return 0
					return {
						tableName: row.tableName,
						rowCount: 0,
					};
				}
			}),
		);

		console.log("tables", tables);
		return tables;
	} finally {
		client.release();
	}
};
