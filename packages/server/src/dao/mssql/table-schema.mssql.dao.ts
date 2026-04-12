import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, TableNameSchemaType } from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

export async function getTableSchema({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<string> {
	const pool = await getMssqlPool(db);

	// Check if table exists
	const tableCheckResult = await pool
		.request()
		.input("tableName", tableName)
		.query(`
			SELECT COUNT(*) as cnt
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_CATALOG = DB_NAME()
			  AND TABLE_NAME = @tableName
			  AND TABLE_SCHEMA = 'dbo'
		`);

	const tableExists = Number(tableCheckResult.recordset[0]?.cnt ?? 0) > 0;
	if (!tableExists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// Get table schema using sp_help which provides comprehensive table information
	// Note: We could also use INFORMATION_SCHEMA or sys.columns for more structured output
	const schemaResult = await pool
		.request()
		.input("tableName", tableName)
		.query(`
			SELECT 
			  c.COLUMN_NAME,
			  c.DATA_TYPE,
			  c.CHARACTER_MAXIMUM_LENGTH,
			  c.NUMERIC_PRECISION,
			  c.NUMERIC_SCALE,
			  c.IS_NULLABLE,
			  c.COLUMN_DEFAULT,
			  CASE 
			    WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRIMARY KEY'
			    WHEN fk.COLUMN_NAME IS NOT NULL THEN 'FOREIGN KEY'
			    ELSE ''
			  END AS KEY_TYPE,
			  fk.REFERENCED_TABLE_NAME,
			  fk.REFERENCED_COLUMN_NAME
			FROM INFORMATION_SCHEMA.COLUMNS c
			LEFT JOIN (
			  SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
			  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
			  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
			    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
			  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
			) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
			  AND c.TABLE_NAME = pk.TABLE_NAME
			  AND c.COLUMN_NAME = pk.COLUMN_NAME
			LEFT JOIN (
			  SELECT 
			    ku.TABLE_SCHEMA,
			    ku.TABLE_NAME,
			    ku.COLUMN_NAME,
			    ku2.TABLE_NAME AS REFERENCED_TABLE_NAME,
			    ku2.COLUMN_NAME AS REFERENCED_COLUMN_NAME
			  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
			  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
			    ON rc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
			  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku2
			    ON rc.UNIQUE_CONSTRAINT_NAME = ku2.CONSTRAINT_NAME
			) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA
			  AND c.TABLE_NAME = fk.TABLE_NAME
			  AND c.COLUMN_NAME = fk.COLUMN_NAME
			WHERE c.TABLE_CATALOG = DB_NAME()
			  AND c.TABLE_NAME = @tableName
			  AND c.TABLE_SCHEMA = 'dbo'
			ORDER BY c.ORDINAL_POSITION
		`);

	if (!schemaResult.recordset || schemaResult.recordset.length === 0) {
		throw new HTTPException(500, {
			message: `Failed to retrieve schema for table "${tableName}"`,
		});
	}

	// Build a CREATE TABLE statement from the schema information
	const columns = schemaResult.recordset.map((col: any) => {
		let columnDef = `  [${col.COLUMN_NAME}] ${col.DATA_TYPE}`;

		// Add length/precision
		if (col.CHARACTER_MAXIMUM_LENGTH) {
			columnDef +=
				col.CHARACTER_MAXIMUM_LENGTH === -1 ? "(MAX)" : `(${col.CHARACTER_MAXIMUM_LENGTH})`;
		} else if (col.NUMERIC_PRECISION) {
			if (col.NUMERIC_SCALE) {
				columnDef += `(${col.NUMERIC_PRECISION},${col.NUMERIC_SCALE})`;
			} else {
				columnDef += `(${col.NUMERIC_PRECISION})`;
			}
		}

		// Add NULL/NOT NULL
		columnDef += col.IS_NULLABLE === "YES" ? " NULL" : " NOT NULL";

		// Add default
		if (col.COLUMN_DEFAULT) {
			columnDef += ` DEFAULT ${col.COLUMN_DEFAULT}`;
		}

		return columnDef;
	});

	const createTableSql = `CREATE TABLE [${tableName}] (\n${columns.join(",\n")}\n)`;

	return createTableSql;
}
