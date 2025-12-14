import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { TableContainer } from "@/components/table-tab/table-container";
import type { TableRecord } from "@/types/table.type";
import { makeColumns, makeData } from "@/utils/make-data";
import { Checkbox } from "../ui/checkbox";

export const TableTab = () => {
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

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		debugTable: true,
	});

	return <TableContainer table={table} />;
};
