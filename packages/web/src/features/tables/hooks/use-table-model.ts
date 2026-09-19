import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { TableCell } from "../components/table-cell";
import { TableSelector } from "../components/table-selector";
import { useColumnPreferences } from "./use-column-preferences";

export const useTableModel = ({
	tableName,
	tableCols,
	tableDataRows,
}: {
	tableName: string;
	tableCols?: ColumnInfoSchemaType[];
	tableDataRows: TableRecord[];
}) => {
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

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

	const sorting = useMemo(() => {
		if (columnName && order) {
			return [{ id: columnName, desc: order === "desc" }];
		}
		return [];
	}, [columnName, order]);

	const handleCellClick = useCallback((rowIndex: number, columnId: string) => {
		setFocusedCell({ rowIndex, columnId });
	}, []);

	const handleCellDoubleClick = useCallback((rowIndex: number, columnId: string) => {
		setEditingCell({ rowIndex, columnId });
	}, []);

	const handleCellEditingStart = useCallback((rowIndex: number, columnId: string) => {
		setEditingCell({ rowIndex, columnId });
	}, []);

	const handleCellEditingStop = useCallback(() => {
		setEditingCell(null);
	}, []);

	const handleDataUpdate = useCallback(() => {}, []);
	const getIsCellSelected = useCallback(() => false, []);

	const tableMeta = useMemo(
		() => ({
			editScope: tableName,
			focusedCell,
			editingCell,
			onCellClick: handleCellClick,
			onCellDoubleClick: handleCellDoubleClick,
			onCellEditingStart: handleCellEditingStart,
			onCellEditingStop: handleCellEditingStop,
			onDataUpdate: handleDataUpdate,
			getIsCellSelected,
		}),
		[
			tableName,
			focusedCell,
			editingCell,
			handleCellClick,
			handleCellDoubleClick,
			handleCellEditingStart,
			handleCellEditingStop,
			handleDataUpdate,
			getIsCellSelected,
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
	};
};
