import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataGridContainer } from "./data-grid-container";

interface DataGridProps<TRow> {
	columns: ColumnDef<TRow>[];
	data: TRow[];
	renderCellAccessory?: (value: unknown) => ReactNode;
}

export const DataGrid = <TRow,>({
	columns,
	data,
	renderCellAccessory,
}: DataGridProps<TRow>) => {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableColumnResizing: true,
		columnResizeMode: "onChange",
	});

	return (
		<DataGridContainer
			table={table}
			renderCellAccessory={renderCellAccessory}
		/>
	);
};
