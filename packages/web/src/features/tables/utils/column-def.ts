import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import type { ColumnDef } from "@tanstack/react-table";
import { cellVariant } from "@/utils/cell-variant";
import type { TableRecord } from "../table.type";

/** A grid column for a table column; `canWriteDefault` when the engine writes DEFAULT from the grid. */
export const toColumnDef = (
	col: ColumnInfoSchemaType,
	canWriteDefault = false,
): ColumnDef<TableRecord> => ({
	accessorKey: col.columnName,
	header: col.columnName,
	meta: {
		variant: cellVariant(col),
		isPrimaryKey: col.isPrimaryKey,
		isForeignKey: col.isForeignKey,
		referencedTable: col.referencedTable,
		referencedSchema: col.referencedSchema,
		referencedColumn: col.referencedColumn,
		enumValues: col.enumValues,
		dataTypeLabel: col.dataTypeLabel,
		isNullable: col.isNullable,
		hasDefault: canWriteDefault && col.columnDefault !== null,
	},
	size: (col.columnName.length + (col.dataTypeLabel?.length || 0)) * 5 + 100,
	minSize: 100,
	maxSize: 500,
});
