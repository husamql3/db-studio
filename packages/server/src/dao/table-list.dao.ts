import type { TableInfoSchemaType } from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getDbPool } from "@/db-manager.js";

const quoteIdentifier = (identifier: string): string => identifier.replaceAll('"', '""');

export async function getTablesList(
	db: DatabaseSchemaType["db"],
): Promise<TableInfoSchemaType[]> {
	const pool = getDbPool(db);

	// First, get all table names
	const tablesQuery = `
		SELECT table_schema as "schemaName", table_name as "tableName"
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE'
		  AND table_schema NOT IN ('pg_catalog', 'information_schema')
		  AND table_schema NOT LIKE 'pg_toast%'
		ORDER BY table_schema, table_name;
	`;

	const { rows: tables } = await pool.query(tablesQuery);
	if (!tables[0]) {
		return [];
	}

	// Get accurate row count for each table
	const result: TableInfoSchemaType[] = await Promise.all(
		tables.map(async (table: { schemaName: string; tableName: string }) => {
			const safeSchemaName = quoteIdentifier(table.schemaName);
			const safeTableName = quoteIdentifier(table.tableName);
			const countQuery = `SELECT COUNT(*)::integer as count FROM "${safeSchemaName}"."${safeTableName}"`;
			const { rows } = await pool.query(countQuery);
			return {
				schemaName: table.schemaName,
				tableName: table.tableName,
				rowCount: rows[0]?.count ?? 0,
			};
		}),
	);

	return result;
}
