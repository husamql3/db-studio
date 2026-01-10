import { getDbPool } from "@/db-manager.js";

export interface TableInfo {
	tableName: string;
	rowCount: number;
}

export const getTablesList = async (database?: string): Promise<TableInfo[]> => {
	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		const res = await client.query(`
      SELECT 
        t.table_name as "tableName",
        COALESCE(s.n_live_tup, 0) as "rowCount" 
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name;
    `);
		return res.rows.map((r: any) => ({
			tableName: r.tableName,
			rowCount: Number(r.rowCount),
		}));
	} finally {
		client.release();
	}
};
