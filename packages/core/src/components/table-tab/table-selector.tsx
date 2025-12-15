import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { TableRecord } from "@/types/table.type";

export const TableSelector = (): ColumnDef<TableRecord, unknown> => ({
	id: "select",
	accessorKey: "select",
	header: ({ table }: { table: Table<TableRecord> }) => (
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
});
