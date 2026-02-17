import { HTTPException } from "hono/http-exception";
import type { TableInfoSchemaType } from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getDbPool } from "@/db-manager.js";

export async function getTablesList(
	db: DatabaseSchemaType["db"],
): Promise<TableInfoSchemaType[]> {
	const pool = getDbPool(db);

	// First, get all table names
	const tablesQuery = `
		SELECT table_name as "tableName"
		FROM information_schema.tables
		WHERE table_schema = 'public'
		  AND table_type = 'BASE TABLE'
		ORDER BY table_name;
	`;

	const { rows: tables } = await pool.query(tablesQuery);
	if (!tables[0]) {
		throw new HTTPException(500, {
			message: "No tables returned from database",
		});
	}

	// Get accurate row count for each table
	const result: TableInfoSchemaType[] = await Promise.all(
		tables.map(async (table: { tableName: string }) => {
			const countQuery = `SELECT COUNT(*)::integer as count FROM "${table.tableName}"`;
			const { rows } = await pool.query(countQuery);
			return {
				tableName: table.tableName,
				rowCount: rows[0]?.count ?? 0,
			};
		}),
	);

	return result;
}
