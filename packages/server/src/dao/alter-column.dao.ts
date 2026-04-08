import { HTTPException } from "hono/http-exception";
import type { AlterColumnParamsSchemaType } from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Alters a PostgreSQL column's type, nullability, and default value.
 */
export async function alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
	const { tableName, columnName, columnType, isNullable, defaultValue, db } = params;
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
	if (!columnRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Column "${columnName}" does not exist in table "${tableName}"`,
		});
	}

	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		await client.query(
			`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${columnType}`,
		);
		await client.query(
			`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" ${isNullable ? "DROP" : "SET"} NOT NULL`,
		);

		if (defaultValue?.trim()) {
			await client.query(
				`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue.trim()}`,
			);
		} else {
			await client.query(
				`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT`,
			);
		}

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
