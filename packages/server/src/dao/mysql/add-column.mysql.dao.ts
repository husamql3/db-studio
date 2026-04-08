import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { AddColumnParamsSchemaType } from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { buildMysqlColumnDefinition } from "./mysql-column.utils.js";

/**
 * Adds a column to a MySQL table using ALTER TABLE ADD COLUMN.
 */
export async function addColumn(params: AddColumnParamsSchemaType): Promise<void> {
	const {
		tableName,
		columnName,
		columnType,
		defaultValue,
		isPrimaryKey,
		isNullable,
		isUnique,
		isIdentity,
		isArray,
		db,
	} = params;
	const pool = getMysqlPool(db);

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

	const [columnRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[tableName, columnName],
	);
	const columnExists = Number((columnRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
	if (columnExists) {
		throw new HTTPException(409, {
			message: `Column "${columnName}" already exists in table "${tableName}"`,
		});
	}

	const columnDefinition = buildMysqlColumnDefinition(
		{
			columnName,
			columnType,
			defaultValue,
			isPrimaryKey,
			isNullable,
			isUnique,
			isIdentity,
			isArray,
		},
		{
			includePrimaryKey: true,
			includeUnique: true,
		},
	);

	await pool.execute<ResultSetHeader>(
		`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinition}`,
	);
}
