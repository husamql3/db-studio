import { HTTPException } from "hono/http-exception";
import type { TableInfoSchemaType } from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getDbPool } from "@/db-manager.js";

export async function getTablesList(
	database: DatabaseSchemaType["database"],
): Promise<TableInfoSchemaType[]> {
	const pool = getDbPool(database);
	const query = `
		SELECT 
			t.table_name as "tableName",
			COALESCE(s.n_live_tup, 0)::integer as "rowCount"
		FROM information_schema.tables t
		LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
		WHERE t.table_schema = 'public'
			AND t.table_type = 'BASE TABLE'
		ORDER BY t.table_name;
	`;

	const { rows } = await pool.query(query);
	if (!rows[0]) {
		throw new HTTPException(500, {
			message: "No tables returned from database",
		});
	}

	return rows;
}
