import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DataGridContainer } from "@/components/data-grid/data-grid-container";

interface DataGridProps<TRow> {
	columns: ColumnDef<TRow>[];
	data: TRow[];
}

export const DataGrid = <TRow,>({ columns, data }: DataGridProps<TRow>) => {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableColumnResizing: true,
		columnResizeMode: "onChange",
	});

	return <DataGridContainer table={table} />;
};
