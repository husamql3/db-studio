import type { Cell, Table } from "@tanstack/react-table";
import type { TableRecord } from "@/types/table.type";
import { TableTextCell } from "./table-text-cell";

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

	// const cellVariant = cell.options.cell;
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
};
