import type { StandardizedDataType } from "./column.type";
import type { DataTypes } from "./data-types.type";
import type { ForeignKeyAction } from "./foreign-key-actions";

export type ColumnInfo = {
	columnName: string; // The column name from the database
	dataType: DataTypes; // Generic type mapped to cell variant (text/boolean/number/enum/json/date)
	dataTypeLabel: StandardizedDataType; // Exact database type (int/varchar/timestamp/etc.)
	isNullable: boolean;
	columnDefault: string | null;
	isPrimaryKey: boolean;
	isUnique: boolean;
	isForeignKey: boolean;
	referencedTable: string | null;
	referencedColumn: string | null;
	onUpdate: ForeignKeyAction | null;
	onDelete: ForeignKeyAction | null;
	enumValues: string[] | null;
};
