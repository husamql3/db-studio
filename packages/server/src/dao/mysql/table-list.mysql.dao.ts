import type { RowDataPacket } from "mysql2";
import type { TableInfoSchemaType } from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getMysqlPool } from "@/db-manager.js";

export async function getTablesList(
	db: DatabaseSchemaType["db"],
): Promise<TableInfoSchemaType[]> {
	const pool = getMysqlPool(db);

	const tablesQuery = `
		SELECT table_name as tableName
		FROM information_schema.tables
		WHERE table_schema = DATABASE()
		  AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`;

	const [tables] = await pool.execute<RowDataPacket[]>(tablesQuery);
	if (!tables || tables.length === 0) {
		return [];
	}

	const result: TableInfoSchemaType[] = await Promise.all(
		(tables as Array<{ tableName: string }>).map(async (table) => {
			const [countRows] = await pool.execute<RowDataPacket[]>(
				`SELECT COUNT(*) as count FROM \`${table.tableName}\``,
			);
			const countRow = (countRows as Array<{ count: number }>)[0];
			return {
				tableName: table.tableName,
				rowCount: countRow?.count ?? 0,
			};
		}),
	);

	return result;
}
