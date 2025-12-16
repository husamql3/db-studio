import type { Cell, Table } from "@tanstack/react-table";
import type { CellVariant, TableRecord } from "@/types/table.type";
import {
	TableBooleanCell,
	TableEnumCell,
	TableNumberCell,
	TableTextCell,
} from "./table-cell-variant";

export const TableCell = ({
	cell,
	table,
}: {
	cell: Cell<TableRecord, unknown>;
	table: Table<TableRecord>;
}) => {
	const meta = table.options.meta;
	const originalRowIndex = cell.row.index;

	const rows = table.getRowModel().rows;
	const displayRowIndex = rows.findIndex((row) => row.original === cell.row.original);
	const rowIndex = displayRowIndex >= 0 ? displayRowIndex : originalRowIndex;
	const columnId = cell.column.id;

	const isFocused =
		meta?.focusedCell?.rowIndex === rowIndex && meta?.focusedCell?.columnId === columnId;
	const isEditing =
		meta?.editingCell?.rowIndex === rowIndex && meta?.editingCell?.columnId === columnId;
	const isSelected = meta?.getIsCellSelected?.(rowIndex, columnId) ?? false;

	const cellVariant = cell.column.columnDef.meta?.variant as CellVariant | undefined;

	switch (cellVariant) {
		case "text":
			return (
				<TableTextCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "boolean":
			return (
				<TableBooleanCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "number":
			return (
				<TableNumberCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "enum":
			return (
				<TableEnumCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "date":
			// return a date picker
			return (
				<TableTextCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "json":
			// return a json editor
			return (
				<TableTextCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
	}
};
