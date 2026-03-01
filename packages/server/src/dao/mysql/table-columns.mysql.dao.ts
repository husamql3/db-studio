import { HTTPException } from "hono/http-exception";
import type { RowDataPacket } from "mysql2";
import {
	type ColumnInfoSchemaType,
	mapMysqlToDataType,
	standardizeMysqlDataTypeLabel,
	type TableNameSchemaType,
} from "shared/types";
import type { DatabaseSchemaType } from "shared/types/database.types.js";
import { getMysqlPool } from "@/db-manager.js";

interface ColumnRow extends RowDataPacket {
	columnName: string;
	dataType: string;
	columnType: string;
	isNullable: number | boolean;
	columnDefault: string | null;
	isPrimaryKey: number | boolean;
	isForeignKey: number | boolean;
	referencedTable: string | null;
	referencedColumn: string | null;
}

/**
 * Parse MySQL enum/set values from COLUMN_TYPE, e.g. "enum('a','b','c')" → ["a","b","c"]
 */
function parseMysqlEnumValues(columnType: string): string[] | null {
	const match = columnType.match(/^(?:enum|set)\((.+)\)$/i);
	if (!match?.[1]) return null;
	return match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

export async function getTableColumns({
	tableName,
	db,
}: {
	tableName: TableNameSchemaType["tableName"];
	db: DatabaseSchemaType["db"];
}): Promise<ColumnInfoSchemaType[]> {
	const pool = getMysqlPool(db);

	const query = `
		SELECT
		  c.COLUMN_NAME            AS columnName,
		  c.DATA_TYPE              AS dataType,
		  c.COLUMN_TYPE            AS columnType,
		  (c.IS_NULLABLE = 'YES')  AS isNullable,
		  c.COLUMN_DEFAULT         AS columnDefault,
		  (c.COLUMN_KEY = 'PRI')   AS isPrimaryKey,
		  (kcu.REFERENCED_TABLE_NAME IS NOT NULL) AS isForeignKey,
		  kcu.REFERENCED_TABLE_NAME AS referencedTable,
		  kcu.REFERENCED_COLUMN_NAME AS referencedColumn
		FROM information_schema.COLUMNS c
		LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
		  ON  c.TABLE_SCHEMA            = kcu.TABLE_SCHEMA
		  AND c.TABLE_NAME              = kcu.TABLE_NAME
		  AND c.COLUMN_NAME             = kcu.COLUMN_NAME
		  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
		WHERE c.TABLE_SCHEMA = DATABASE()
		  AND c.TABLE_NAME = ?
		ORDER BY c.ORDINAL_POSITION
	`;

	const [rows] = await pool.execute<ColumnRow[]>(query, [tableName]);

	if (!rows || rows.length === 0) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	return rows.map((r) => {
		const dataType = r.dataType as string;
		const columnType = r.columnType as string;
		const isEnum = dataType === "enum" || dataType === "set";
		const enumValues = isEnum ? parseMysqlEnumValues(columnType) : null;

		return {
			columnName: r.columnName,
			dataType: mapMysqlToDataType(dataType, columnType),
			dataTypeLabel: standardizeMysqlDataTypeLabel(dataType, columnType),
			isNullable: Boolean(r.isNullable),
			columnDefault: r.columnDefault ?? null,
			isPrimaryKey: Boolean(r.isPrimaryKey),
			isForeignKey: Boolean(r.isForeignKey),
			referencedTable: r.referencedTable ?? null,
			referencedColumn: r.referencedColumn ?? null,
			enumValues,
		};
	});
}
