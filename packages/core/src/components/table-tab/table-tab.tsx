import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { useQueryState } from "nuqs";
import { useMemo } from "react";
import { TableContainer } from "@/components/table-tab/table-container";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { makeColumns, makeData } from "@/utils/make-data";
import { Checkbox } from "../ui/checkbox";

export const TableTab = () => {
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const [columnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [order] = useQueryState(CONSTANTS.ORDER);

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
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		debugTable: true,
		state: {
			sorting,
		},
		manualSorting: false,
		onPaginationChange: (pagination) => {
			console.log(pagination);
		},
		onRowSelectionChange: (rowSelection) => {
			console.log(rowSelection);
		},
		onColumnSizingChange: (columnSizing) => {
			console.log(columnSizing);
		},
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
