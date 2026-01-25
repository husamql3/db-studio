import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TableHeader } from "@/components/table-tab/header/table-header";
import { TableCell } from "@/components/table-tab/table-cell";
import { TableContainer } from "@/components/table-tab/table-container";
import { TableFooter } from "@/components/table-tab/table-footer";
import { TableSelector } from "@/components/table-tab/table-selector";
import { Spinner } from "@/components/ui/spinner";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
// todo: change the color of the scrollbar

export const TableTab = ({ tableName }: { tableName: string }) => {
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

	const { tableData, isLoadingTableData, errorTableData } = useTableData({
		tableName,
	});
	const { tableCols, isLoadingTableCols, errorTableCols } = useTableCols({
		tableName,
	});

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

	const selectorColumn = useMemo(() => TableSelector(), []);

	const columns = useMemo<ColumnDef<TableRecord, unknown>[]>(
		() => [
			selectorColumn,
			...(tableCols?.map((col) => ({
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					variant: col.enumValues ? "enum" : col.dataType,
					isPrimaryKey: col.isPrimaryKey,
					isForeignKey: col.isForeignKey,
					referencedTable: col.referencedTable,
					referencedColumn: col.referencedColumn,
					enumValues: col.enumValues,
					dataTypeLabel: col.dataTypeLabel, // This is the exact DB type (int/varchar/etc.)
				},
				size: (col.columnName.length + (col.dataTypeLabel?.length || 0)) * 5 + 100,
				minSize: 100,
				maxSize: 500,
			})) || []),
		],
		[tableCols, selectorColumn],
	);

	// Clear row selection when table changes
	useEffect(() => {
		setRowSelection({});
	}, [tableName]);

	// Initialize sorting state from URL params
	const sorting = useMemo(() => {
		if (columnName && order) {
			return [{ id: columnName, desc: order === "desc" }];
		}
		return [];
	}, [columnName, order]);

	// Memoize table data to avoid unnecessary re-renders
	const tableDataRows = useMemo(() => tableData?.data || [], [tableData?.data]);

	// Stable callbacks to prevent infinite re-renders
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

	const handleDataUpdate = useCallback((update: unknown) => {
		console.log("Data update:", update);
	}, []);

	const getIsCellSelected = useCallback(() => false, []);

	const tableMeta = useMemo(
		() => ({
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

	const hasNoData = !tableData || !tableData.data || tableData.data.length === 0;

	const selectedRows = table.getSelectedRowModel().rows;

	if (isLoadingTableData || isLoadingTableCols) {
		return (
			<div className="size-full flex items-center justify-center">
				<Spinner size="size-7" />
			</div>
		);
	}

	if (errorTableData || errorTableCols) {
		return (
			<div className="size-full flex items-center justify-center">
				Error: {errorTableData?.message || errorTableCols?.message}
			</div>
		);
	}

	if (hasNoData) {
		return (
			<div className="size-full flex flex-col items-center justify-center">
				<TableHeader
					selectedRows={selectedRows}
					setRowSelection={setRowSelection}
					tableName={tableName}
				/>
				<div className="text-sm text-muted-foreground flex-1 flex items-center justify-center">
					No data available for "{tableName}" table
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 w-full flex flex-col overflow-hidden">
			<TableHeader
				selectedRows={selectedRows}
				setRowSelection={setRowSelection}
				tableName={tableName}
			/>
			<TableContainer table={table} />
			<TableFooter tableName={tableName} />
		</div>
	);
};
