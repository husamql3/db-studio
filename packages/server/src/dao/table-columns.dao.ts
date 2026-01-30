import { HTTPException } from "hono/http-exception";
import {
	type ColumnInfoSchemaType,
	type DatabaseSchemaType,
	mapPostgresToDataType,
	standardizeDataTypeLabel,
	type TableNameSchemaType,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

export async function getTableColumns({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<ColumnInfoSchemaType[]> {
	const pool = getDbPool(db);
	const query = `
    SELECT 
      c.column_name as "columnName",
      c.data_type as "dataType",
      c.udt_name as "udtName",
      c.is_nullable = 'YES' as "isNullable",
      c.column_default as "columnDefault",
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey",
      CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as "isForeignKey",
      fk.referenced_table as "referencedTable",
      fk.referenced_column as "referencedColumn",
      CASE 
        WHEN c.data_type = 'USER-DEFINED' THEN 
          (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = c.udt_name)
        ELSE NULL
      END as "enumValues"
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
        AND tc.table_schema = ku.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    ) pk ON c.column_name = pk.column_name
    LEFT JOIN (
      SELECT 
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    ) fk ON c.column_name = fk.column_name
    WHERE c.table_schema = 'public'
      AND c.table_name = $1
    ORDER BY c.ordinal_position;
  `;

	const { rows } = await pool.query(query, [tableName]);
	if (!rows || rows.length === 0) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	type ColumnRow = {
		columnName: string;
		dataType: string;
		isNullable: boolean;
		columnDefault: string | null;
		isPrimaryKey: boolean;
		isForeignKey: boolean;
		referencedTable: string | null;
		referencedColumn: string | null;
		enumValues?: string | string[] | null;
	};
	return (rows as ColumnRow[]).map((r) => {
		// Parse enumValues to always return string[] | null
		let parsedEnumValues: string[] | null = null;
		if (r.enumValues) {
			if (Array.isArray(r.enumValues)) {
				// Already an array, use as-is
				parsedEnumValues = r.enumValues;
			} else if (typeof r.enumValues === "string") {
				// Parse PostgreSQL array format: "{VALUE1,VALUE2,VALUE3}"
				parsedEnumValues = r.enumValues.replace(/[{}]/g, "").split(",").filter(Boolean);
			}
		}

		return {
			columnName: r.columnName,
			dataType: mapPostgresToDataType(r.dataType),
			dataTypeLabel: standardizeDataTypeLabel(r.dataType),
			isNullable: r.isNullable,
			columnDefault: r.columnDefault,
			isPrimaryKey: r.isPrimaryKey,
			isForeignKey: r.isForeignKey,
			referencedTable: r.referencedTable,
			referencedColumn: r.referencedColumn,
			enumValues: parsedEnumValues,
		};
	});
}
