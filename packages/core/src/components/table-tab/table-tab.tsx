import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { TableContainer } from "@/components/table-tab/table-container";
import { makeColumns, makeData } from "@/utils/make-data";

export const TableTab = () => {
	const columns = useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
		() => makeColumns(10),
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
