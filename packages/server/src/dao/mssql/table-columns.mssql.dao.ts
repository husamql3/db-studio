import { HTTPException } from "hono/http-exception";
import {
	type ColumnInfoSchemaType,
	mapMssqlToDataType,
	standardizeMssqlDataTypeLabel,
	type TableNameSchemaType,
} from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getMssqlPool } from "@/db-manager.js";

interface ColumnRow {
	columnName: string;
	dataType: string;
	isNullable: number | boolean;
	columnDefault: string | null;
	isPrimaryKey: number | boolean;
	isForeignKey: number | boolean;
	referencedTable: string | null;
	referencedColumn: string | null;
}

export async function getTableColumns({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<ColumnInfoSchemaType[]> {
	const pool = await getMssqlPool(db);

	const query = `
		SELECT
		  c.COLUMN_NAME AS columnName,
		  c.DATA_TYPE AS dataType,
		  CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS isNullable,
		  c.COLUMN_DEFAULT AS columnDefault,
		  CASE 
		    WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 
		    ELSE 0 
		  END AS isPrimaryKey,
		  CASE 
		    WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 
		    ELSE 0 
		  END AS isForeignKey,
		  fk.REFERENCED_TABLE_NAME AS referencedTable,
		  fk.REFERENCED_COLUMN_NAME AS referencedColumn
		FROM INFORMATION_SCHEMA.COLUMNS c
		LEFT JOIN (
		  SELECT 
		    ku.TABLE_SCHEMA,
		    ku.TABLE_NAME,
		    ku.COLUMN_NAME
		  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
		  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
		    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
		    AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
		    AND tc.TABLE_NAME = ku.TABLE_NAME
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
		    AND rc.CONSTRAINT_SCHEMA = ku.TABLE_SCHEMA
		  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku2
		    ON rc.UNIQUE_CONSTRAINT_NAME = ku2.CONSTRAINT_NAME
		    AND rc.UNIQUE_CONSTRAINT_SCHEMA = ku2.TABLE_SCHEMA
		) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA
		  AND c.TABLE_NAME = fk.TABLE_NAME
		  AND c.COLUMN_NAME = fk.COLUMN_NAME
		WHERE c.TABLE_CATALOG = DB_NAME()
		  AND c.TABLE_NAME = @tableName
		  AND c.TABLE_SCHEMA = 'dbo'
		ORDER BY c.ORDINAL_POSITION
	`;

	const result = await pool.request().input("tableName", tableName).query(query);

	if (!result.recordset || result.recordset.length === 0) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	return (result.recordset as ColumnRow[]).map((r) => {
		const dataType = r.dataType as string;

		return {
			columnName: r.columnName,
			dataType: mapMssqlToDataType(dataType),
			dataTypeLabel: standardizeMssqlDataTypeLabel(dataType),
			isNullable: Boolean(r.isNullable),
			columnDefault: r.columnDefault ?? null,
			isPrimaryKey: Boolean(r.isPrimaryKey),
			isForeignKey: Boolean(r.isForeignKey),
			referencedTable: r.referencedTable ?? null,
			referencedColumn: r.referencedColumn ?? null,
			enumValues: null, // SQL Server doesn't have native enum types
		};
	});
}
