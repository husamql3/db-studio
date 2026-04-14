import type { TableInfoSchemaType } from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getMssqlPool } from "@/db-manager.js";

export async function getTablesList(
	db: DatabaseSchemaType["db"],
): Promise<TableInfoSchemaType[]> {
	const pool = await getMssqlPool(db);

	const tablesQuery = `
		SELECT table_name AS tableName
		FROM information_schema.tables
		WHERE table_catalog = DB_NAME()
		  AND table_type = 'BASE TABLE'
		  AND table_schema = 'dbo'
		ORDER BY table_name
	`;

	const result = await pool.request().query(tablesQuery);
	if (!result.recordset || result.recordset.length === 0) {
		return [];
	}

	const tablesList: TableInfoSchemaType[] = await Promise.all(
		(result.recordset as Array<{ tableName: string }>).map(async (table) => {
			const countResult = await pool
				.request()
				.query(`SELECT COUNT(*) as count FROM [${table.tableName}]`);
			const countRow = countResult.recordset[0] as { count: number };
			return {
				tableName: table.tableName,
				rowCount: countRow?.count ?? 0,
			};
		}),
	);

	return tablesList;
}
