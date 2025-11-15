import { db } from "../db.js";
import { type DataType, mapPostgresToDataType, standardizeDataTypeLabel } from "../types/column.types.js";

export interface ColumnInfo {
	columnName: string;
	dataType: DataType;
	isNullable: boolean;
	columnDefault: string | null;
	isPrimaryKey: boolean;
}

export const getTableColumns = async (tableName: string): Promise<ColumnInfo[]> => {
	const client = await db.connect();
	try {
		const res = await client.query(
			`
      SELECT 
        c.column_name as "columnName",
        c.data_type as "dataType",
        c.is_nullable = 'YES' as "isNullable",
        c.column_default as "columnDefault",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey"
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
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position;
    `,
			[tableName],
		);

		return res.rows.map((r) => ({
			columnName: r.columnName,
			dataType: mapPostgresToDataType(r.dataType),
			dataTypeLabel: standardizeDataTypeLabel(r.dataType),
			isNullable: r.isNullable,
			columnDefault: r.columnDefault,
			isPrimaryKey: r.isPrimaryKey,
		}));
	} finally {
		client.release();
	}
};
