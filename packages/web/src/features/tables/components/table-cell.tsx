import type { Cell, Table } from "@tanstack/react-table";
import { useMemo } from "react";
import type { CellVariant, TableRecord } from "@/types/table.type";
import { formatCellValue } from "@/utils/format-cell-value";
import {
	TableBooleanCell,
	TableDateCell,
	TableEnumCell,
	TableForeignKeyCell,
	TableJsonCell,
	TableNumberCell,
	TableTextCell,
} from "./table-cell-variant";
import { TableCellWrapper } from "./table-cell-wrapper";

export const TableCell = ({
	cell,
	table,
}: {
	cell: Cell<TableRecord, unknown>;
	table: Table<TableRecord>;
}) => {
	const meta = table.options.meta;

	// Display position within the current (possibly sorted/filtered) row model.
	// Memoized on the row-model identity + this row's data so the O(N) scan runs
	// at most once per render pass per row model rather than on every cell render.
	const rows = table.getRowModel().rows;
	const rowIndex = useMemo(() => {
		const displayRowIndex = rows.findIndex((row) => row.original === cell.row.original);
		return displayRowIndex >= 0 ? displayRowIndex : cell.row.index;
	}, [rows, cell.row.original, cell.row.index]);
	const columnId = cell.column.id;

	const isFocused =
		meta?.focusedCell?.rowIndex === rowIndex && meta?.focusedCell?.columnId === columnId;
	const isEditing =
		meta?.editingCell?.rowIndex === rowIndex && meta?.editingCell?.columnId === columnId;
	const isSelected = meta?.getIsCellSelected?.(rowIndex, columnId) ?? false;

	const cellVariant = cell.column.columnDef.meta?.variant as CellVariant | undefined;
	const isForeignKey = cell.column.columnDef.meta?.isForeignKey;
	const referencedTable = cell.column.columnDef.meta?.referencedTable;

	if (meta?.canMutateRows === false) {
		const value = cell.getValue();
		return (
			<TableCellWrapper
				cell={cell}
				table={table}
				rowIndex={rowIndex}
				columnId={columnId}
				isEditing={false}
				isFocused={isFocused}
				isSelected={isSelected}
				aria-readonly="true"
				title={meta.rowMutationReason}
				className="pr-7"
			>
				<span data-slot="grid-cell-content">{formatCellValue(value)}</span>
			</TableCellWrapper>
		);
	}

	if (isForeignKey && referencedTable) {
		return (
			<TableForeignKeyCell
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
			return (
				<TableDateCell
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
				<TableJsonCell
					cell={cell}
					table={table}
					rowIndex={rowIndex}
					columnId={columnId}
					isEditing={isEditing}
					isFocused={isFocused}
					isSelected={isSelected}
				/>
			);
		case "array":
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
		default:
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
