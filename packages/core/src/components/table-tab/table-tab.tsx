import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { TableCell } from "@/components/table-tab/table-cell";
import { TableContainer } from "@/components/table-tab/table-container";
import { TableHeader } from "@/components/table-tab/table-header";
import { TableSelector } from "@/components/table-tab/table-selector";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { Spinner } from "../ui/spinner";

// todo: change the color of the scrollbar

export const TableTab = () => {
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.ORDER);

	const { tableData, isLoadingTableData, errorTableData } = useTableData();
	const { tableCols, isLoadingTableCols, errorTableCols } = useTableCols();

	const [rowSelection, setRowSelection] = useState({});
	const [columnSizing, setColumnSizing] = useState({});
	const [focusedCell, setFocusedCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);
	const [editingCell, setEditingCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);

	const columns = useMemo<ColumnDef<TableRecord, unknown>[]>(
		() => [
			TableSelector(),
			...(tableCols?.map((col) => ({
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					variant: col.dataType, // This is the mapped generic type (text/boolean/number/etc.)
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
		[tableCols],
	);

	// Initialize sorting state from URL params
	const sorting = useMemo(() => {
		if (columnName && order) {
			return [{ id: columnName, desc: order === "desc" }];
		}
		return [];
	}, [columnName, order]);

	const table = useReactTable({
		data: tableData?.data || [],
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
		debugTable: true,
		onRowSelectionChange: setRowSelection,
		onColumnSizingChange: setColumnSizing,
		meta: {
			focusedCell,
			editingCell,
			onCellClick: (rowIndex: number, columnId: string) => {
				setFocusedCell({ rowIndex, columnId });
			},
			onCellDoubleClick: (rowIndex: number, columnId: string) => {
				setEditingCell({ rowIndex, columnId });
			},
			onCellEditingStart: (rowIndex: number, columnId: string) => {
				setEditingCell({ rowIndex, columnId });
			},
			onCellEditingStop: () => {
				setEditingCell(null);
			},
			onDataUpdate: (update: unknown) => {
				console.log("Data update:", update);
			},
			getIsCellSelected: () => false,
		},
		onPaginationChange: (pagination) => {
			console.log(pagination);
		},
		onColumnVisibilityChange: (columnVisibility) => {
			console.log(columnVisibility);
		},
		onColumnOrderChange: (columnOrder) => {
			console.log(columnOrder);
		},
	});

	const hasNoData = !tableData?.data || tableData.data.length === 0;

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

	if (!activeTable) {
		return (
			<div className="size-full flex items-center justify-center">No table selected</div>
		);
	}

	if (hasNoData) {
		return (
			<div className="size-full flex items-center justify-center">No data available</div>
		);
	}

	return (
		<div className="h-full w-full">
			<TableHeader />
			<TableContainer table={table} />
		</div>
	);
};
