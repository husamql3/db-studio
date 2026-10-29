import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayStore } from "@/stores/overlay.store";
import type { CellRange, NavigationDirection, TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { TableCell } from "../components/table-cell";
import { TableSelector } from "../components/table-selector";
import { useLiveModeStore } from "../stores/live-mode.store";
import { useRowDetailsStore } from "../stores/row-details.store";
import { getRecordKey } from "../utils/table-diff";
import { useColumnPreferences } from "./use-column-preferences";
import { useEditScope } from "./use-edit-scope";
import { useRowMutation } from "./use-row-mutation";

export const useTableModel = ({
	tableName,
	tableCols,
	tableDataRows,
	isRowHighlighted,
	isCellHighlighted,
}: {
	tableName: string;
	tableCols?: ColumnInfoSchemaType[];
	tableDataRows: TableRecord[];
	isRowHighlighted?: (rowId: string) => boolean;
	isCellHighlighted?: (rowId: string, columnId: string) => boolean;
}) => {
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);
	const { canMutateRows, rowMutationReason } = useRowMutation();
	const editScope = useEditScope(tableName, tableCols);

	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
	const [focusedCell, setFocusedCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);
	const [editingCell, setEditingCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);
	const [selection, setSelection] = useState<CellRange | null>(null);
	const isDragging = useRef(false);

	const { visibleColumns } = useColumnPreferences({ tableName, tableCols });

	const visibleCols = useMemo(() => {
		if (!tableCols) return undefined;
		const byName = new Map(tableCols.map((col) => [col.columnName, col]));
		return visibleColumns
			.map((name) => byName.get(name))
			.filter((col): col is ColumnInfoSchemaType => !!col);
	}, [tableCols, visibleColumns]);

	const selectorColumn = useMemo(() => TableSelector(), []);

	const columns = useMemo<ColumnDef<TableRecord, unknown>[]>(
		() => [
			selectorColumn,
			...(visibleCols?.map((col) => ({
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					variant: col.enumValues ? "enum" : col.dataType,
					isPrimaryKey: col.isPrimaryKey,
					isForeignKey: col.isForeignKey,
					referencedTable: col.referencedTable,
					referencedColumn: col.referencedColumn,
					enumValues: col.enumValues,
					dataTypeLabel: col.dataTypeLabel,
					isNullable: col.isNullable,
				},
				size: (col.columnName.length + (col.dataTypeLabel?.length || 0)) * 5 + 100,
				minSize: 100,
				maxSize: 500,
			})) || []),
		],
		[visibleCols, selectorColumn],
	);

	useEffect(() => {
		setRowSelection({});
	}, [tableName]);

	useEffect(() => {
		if (!canMutateRows) setEditingCell(null);
	}, [canMutateRows]);

	const sorting = useMemo(() => {
		if (columnName && order) {
			return [{ id: columnName, desc: order === "desc" }];
		}
		return [];
	}, [columnName, order]);

	// Rows and columns move under a range when the data, sort or visible columns change.
	useEffect(() => {
		setSelection(null);
	}, [tableDataRows, sorting, visibleCols]);

	const handleCellClick = useCallback((rowIndex: number, columnId: string) => {
		setFocusedCell({ rowIndex, columnId });
	}, []);

	const handleCellDoubleClick = useCallback(
		(rowIndex: number, columnId: string) => {
			if (canMutateRows) setEditingCell({ rowIndex, columnId });
		},
		[canMutateRows],
	);

	const handleCellEditingStart = useCallback(
		(rowIndex: number, columnId: string) => {
			if (canMutateRows) setEditingCell({ rowIndex, columnId });
		},
		[canMutateRows],
	);

	const columnIds = useMemo(
		() => visibleCols?.map((col) => col.columnName) ?? [],
		[visibleCols],
	);
	const rowCount = tableDataRows.length;

	const handleCellNavigate = useCallback(
		(rowIndex: number, columnId: string, direction: NavigationDirection) => {
			let row = rowIndex;
			let col = columnIds.indexOf(columnId);
			if (direction === "up") row--;
			else if (direction === "down") row++;
			else if (direction === "left") col--;
			else if (direction === "right") col++;
			else if (direction === "home") col = 0;
			else if (direction === "end") col = columnIds.length - 1;
			if (row < 0 || row >= rowCount || col < 0 || col >= columnIds.length) return false;
			setFocusedCell({ rowIndex: row, columnId: columnIds[col] });
			// A range left behind would take the next paste at the old position.
			setSelection(null);
			return true;
		},
		[columnIds, rowCount],
	);

	const handleCellEditingStop = useCallback(
		(opts?: { direction?: NavigationDirection }) => {
			setEditingCell(null);
			if (opts?.direction && editingCell) {
				handleCellNavigate(editingCell.rowIndex, editingCell.columnId, opts.direction);
			}
		},
		[editingCell, handleCellNavigate],
	);

	const handleRowDetailsOpen = useCallback(
		(rowIndex: number) => {
			useRowDetailsStore.getState().setRowDetails(tableName, rowIndex);
			useOverlayStore.getState().openOverlay("tables.row-details");
		},
		[tableName],
	);

	const handleDataUpdate = useCallback(() => {}, []);

	// A press starts a range at the cell, Shift extends the current one, and dragging stretches it.
	const handleCellMouseDown = useCallback(
		(rowIndex: number, columnId: string, event: MouseEvent) => {
			if (event.button !== 0) return;
			// No native text selection while dragging across cells; focus the cell ourselves.
			event.preventDefault();
			(event.currentTarget as HTMLElement).focus();
			const cell = { rowIndex, columnId };
			setSelection((current) =>
				event.shiftKey && current
					? { ...current, focus: cell }
					: { anchor: cell, focus: cell },
			);
			if (!event.shiftKey) setFocusedCell(cell);
			isDragging.current = true;
			window.addEventListener("mouseup", () => (isDragging.current = false), { once: true });
		},
		[],
	);

	const handleCellMouseEnter = useCallback((rowIndex: number, columnId: string) => {
		if (isDragging.current) {
			setSelection((current) => current && { ...current, focus: { rowIndex, columnId } });
		}
	}, []);

	const columnIndexes = useMemo(
		() => new Map(visibleCols?.map((col, index) => [col.columnName, index])),
		[visibleCols],
	);

	const getIsCellSelected = useCallback(
		(rowIndex: number, columnId: string) => {
			if (!selection) return false;
			const { anchor, focus } = selection;
			// One cell is the focused cell, not a range.
			if (anchor.rowIndex === focus.rowIndex && anchor.columnId === focus.columnId) {
				return false;
			}
			const column = columnIndexes.get(columnId) ?? -1;
			const [a, b] = [
				columnIndexes.get(anchor.columnId) ?? -1,
				columnIndexes.get(focus.columnId) ?? -1,
			];
			return (
				rowIndex >= Math.min(anchor.rowIndex, focus.rowIndex) &&
				rowIndex <= Math.max(anchor.rowIndex, focus.rowIndex) &&
				column >= Math.min(a, b) &&
				column <= Math.max(a, b)
			);
		},
		[selection, columnIndexes],
	);

	const pkCols = useMemo(
		() => tableCols?.filter((col) => col.isPrimaryKey).map((col) => col.columnName) ?? [],
		[tableCols],
	);

	const getRowId = useCallback((row: TableRecord) => getRecordKey(row, pkCols), [pkCols]);

	const tableMeta = useMemo(
		() => ({
			editScope,
			canMutateRows,
			rowMutationReason,
			focusedCell,
			editingCell,
			selection,
			onCellClick: handleCellClick,
			onCellMouseDown: handleCellMouseDown,
			onCellMouseEnter: handleCellMouseEnter,
			onCellDoubleClick: handleCellDoubleClick,
			onCellEditingStart: handleCellEditingStart,
			onCellEditingStop: handleCellEditingStop,
			onCellNavigate: handleCellNavigate,
			onRowDetailsOpen: handleRowDetailsOpen,
			onDataUpdate: handleDataUpdate,
			getIsCellSelected,
			isRowHighlighted:
				isRowHighlighted ??
				((rowId: string) => useLiveModeStore.getState().isRowHighlighted(rowId)),
			isCellHighlighted:
				isCellHighlighted ??
				((rowId: string, columnId: string) =>
					useLiveModeStore.getState().isCellHighlighted(rowId, columnId)),
		}),
		[
			tableName,
			canMutateRows,
			rowMutationReason,
			focusedCell,
			editingCell,
			selection,
			handleCellClick,
			handleCellMouseDown,
			handleCellMouseEnter,
			handleCellDoubleClick,
			handleCellEditingStart,
			handleCellEditingStop,
			handleCellNavigate,
			handleRowDetailsOpen,
			handleDataUpdate,
			getIsCellSelected,
			isRowHighlighted,
			isCellHighlighted,
		],
	);

	const table = useReactTable({
		data: tableDataRows,
		columns,
		defaultColumn: {
			cell: TableCell,
			size: 50,
			minSize: 100,
			maxSize: 500,
		},
		getRowId,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		state: {
			sorting,
			rowSelection,
			columnSizing,
		},
		manualSorting: false,
		enableRowSelection: true,
		enableMultiRowSelection: true,
		enableColumnResizing: true,
		columnResizeMode: "onChange",
		onRowSelectionChange: setRowSelection,
		onColumnSizingChange: setColumnSizing,
		meta: tableMeta,
	});

	return {
		table,
		selectedRows: table.getSelectedRowModel().rows,
		setRowSelection,
		isEditingCell: !!editingCell,
	};
};
