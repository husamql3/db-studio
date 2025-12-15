import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { TableContainer } from "@/components/table-tab/table-container";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { makeColumns, makeData } from "@/utils/make-data";
import { Checkbox } from "../ui/checkbox";
import { TableCell } from "./table-cell";

export const TableTab = () => {
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.ORDER);
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
			{
				id: "select",
				accessorKey: "select",
				header: ({ table }) => (
					<div className="w-full h-full flex items-center justify-center">
						<Checkbox
							checked={table.getIsAllRowsSelected()}
							onCheckedChange={() => table.toggleAllRowsSelected()}
						/>
					</div>
				),
				cell: ({ row }: { row: Row<TableRecord> }) => (
					<div className="w-full h-full flex items-center justify-center">
						<Checkbox
							checked={row.getIsSelected()}
							onCheckedChange={() => row.toggleSelected()}
						/>
					</div>
				),
				size: 20,
				enableSorting: false,
			},
			...makeColumns(10),
		],
		[],
	);

	const data = useMemo(() => makeData(100, columns), [columns]);

	// Initialize sorting state from URL params
	const sorting = useMemo(() => {
		if (columnName && order) {
			return [{ id: columnName, desc: order === "desc" }];
		}
		return [];
	}, [columnName, order]);

	const table = useReactTable({
		data,
		columns,
		defaultColumn: {
			cell: TableCell,
			size: 50,
			minSize: 100,
			maxSize: 500,
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		debugTable: true,
		state: {
			sorting,
			rowSelection,
			columnSizing,
		},
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
			onDataUpdate: (update) => {
				console.log("Data update:", update);
			},
			getIsCellSelected: () => false,
		},
		manualSorting: false,
		enableRowSelection: true,
		enableMultiRowSelection: true,
		enableColumnResizing: true,
		columnResizeMode: "onChange",
		onPaginationChange: (pagination) => {
			console.log(pagination);
		},
		onRowSelectionChange: setRowSelection,
		onColumnSizingChange: setColumnSizing,
		onColumnVisibilityChange: (columnVisibility) => {
			console.log(columnVisibility);
		},
		onColumnOrderChange: (columnOrder) => {
			console.log(columnOrder);
		},
	});

	if (!activeTable) {
		return <div>No table selected</div>;
	}

	return <TableContainer table={table} />;
};
