import {
	type ColumnInfo,
	mapPostgresToDataType,
	standardizeDataTypeLabel,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const getTableColumn = async (
	tableName: string,
	columnName: string,
	database?: string,
): Promise<ColumnInfo | null> => {
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		const res = await client.query(
			`
      SELECT 
        c.column_name as "columnName",
        c.data_type as "dataType",
        c.udt_name as "udtName",
        c.is_nullable = 'YES' as "isNullable",
        c.column_default as "columnDefault",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey",
        CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END as "isUnique",
        CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as "isForeignKey",
        fk.referenced_table as "referencedTable",
        fk.referenced_column as "referencedColumn",
        fk.on_update as "onUpdate",
        fk.on_delete as "onDelete",
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
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
      ) uq ON c.column_name = uq.column_name
      LEFT JOIN (
        SELECT 
          kcu.column_name,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column,
          rc.update_rule AS on_update,
          rc.delete_rule AS on_delete
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
      ) fk ON c.column_name = fk.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
        AND c.column_name = $2
      ORDER BY c.ordinal_position
      LIMIT 1;
    `,
			[tableName, columnName],
		);

		if (res.rows.length === 0) {
			return null;
		}

		const r = res.rows[0];

		// Parse enumValues to always return string[] | null
		let parsedEnumValues: string[] | null = null;
		if (r.enumValues) {
			if (Array.isArray(r.enumValues)) {
				parsedEnumValues = r.enumValues;
			} else if (typeof r.enumValues === "string") {
				parsedEnumValues = r.enumValues
					.replace(/[{}]/g, "")
					.split(",")
					.filter(Boolean);
			}
		}

		return {
			columnName: r.columnName,
			dataType: mapPostgresToDataType(r.dataType),
			dataTypeLabel: standardizeDataTypeLabel(r.dataType),
			isNullable: r.isNullable,
			columnDefault: r.columnDefault,
			isPrimaryKey: r.isPrimaryKey,
			isUnique: r.isUnique,
			isForeignKey: r.isForeignKey,
			referencedTable: r.referencedTable,
			referencedColumn: r.referencedColumn,
			onUpdate: r.onUpdate,
			onDelete: r.onDelete,
			enumValues: parsedEnumValues,
		};
	} finally {
		client.release();
	}
};
