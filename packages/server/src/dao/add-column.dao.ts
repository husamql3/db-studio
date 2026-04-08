import { HTTPException } from "hono/http-exception";
import type { AddColumnParamsSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Adds a column to a PostgreSQL table using ALTER TABLE ADD COLUMN.
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
	const pool = getDbPool(db);

	const tableExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = $1 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: tableRows } = await pool.query(tableExistsQuery, [tableName]);
	if (!tableRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	const columnExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: columnRows } = await pool.query(columnExistsQuery, [tableName, columnName]);
	if (columnRows[0]?.exists) {
		throw new HTTPException(409, {
			message: `Column "${columnName}" already exists in table "${tableName}"`,
		});
	}

	let columnDefinition = `"${columnName}" ${columnType}`;

	if (isArray) {
		columnDefinition += "[]";
	}

	if (isPrimaryKey) {
		columnDefinition += " PRIMARY KEY";
	}

	if (isUnique && !isPrimaryKey) {
		columnDefinition += " UNIQUE";
	}

	if (!isNullable) {
		columnDefinition += " NOT NULL";
	}

	if (isIdentity) {
		columnDefinition += " GENERATED ALWAYS AS IDENTITY";
	}

	if (defaultValue?.trim() && !isIdentity) {
		columnDefinition += ` DEFAULT ${defaultValue.trim()}`;
	}

	await pool.query(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDefinition}`);
}
