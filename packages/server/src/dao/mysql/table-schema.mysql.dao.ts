import { HTTPException } from "hono/http-exception";
import type { RowDataPacket } from "mysql2";
import type { DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

export async function getTableSchema({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<string> {
	const pool = getMysqlPool(db);

	// Check if table exists
	const [tableRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		[tableName],
	);
	const tableExists = Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (!tableExists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// SHOW CREATE TABLE returns the full DDL including column types, indexes, FK constraints
	const [rows] = await pool.execute<RowDataPacket[]>(`SHOW CREATE TABLE \`${tableName}\``);
	const row = (rows as Array<Record<string, string>>)[0];

	// The result row has "Create Table" key
	const createTableSql = row?.["Create Table"] ?? row?.create_table ?? "";
	if (!createTableSql) {
		throw new HTTPException(500, {
			message: `Failed to retrieve schema for table "${tableName}"`,
		});
	}

	return createTableSql;
}
