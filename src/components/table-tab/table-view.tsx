import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useDataGrid } from "@/hooks/use-data-grid";
import { useTableCols } from "@/hooks/use-table-cols";
import { useTableData } from "@/hooks/use-table-data";
import { useActiveTableStore } from "@/stores/active-table.store";
import { getCellVariant } from "@/utils/table-grid.helpers";
import { DataGrid } from "../data-grid/data-grid";
import { TableHeader } from "./header/table-header";
import { TableEmpty } from "./table-empty";
import { TableFooter } from "./table-footer";

export const TableView = () => {
	const { activeTable } = useActiveTableStore();
	const [pageIndex, setPageIndex] = useState(0);
	const [pageSize, setPageSize] = useState(50);

	const { tableCols, isLoadingTableCols } = useTableCols(activeTable);
	const { tableData, isLoadingTableData } = useTableData(
		activeTable,
		pageIndex + 1, // API uses 1-based pagination
		pageSize,
	);

	const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
		return (
			tableCols?.map((col) => ({
				id: col.columnName,
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					cell: getCellVariant(col.dataType),
					dataTypeLabel: col.dataTypeLabel,
					isPrimaryKey: col.isPrimaryKey,
				},
				minSize: 150,
			})) ?? []
		);
	}, [tableCols]);

	const { table, ...dataGridProps } = useDataGrid({
		columns,
		data: tableData?.data ?? [],
		enableSearch: true,
		// server-side pagination
		manualPagination: true,
		pageCount: tableData?.pagination.totalPages ?? 0,
		state: {
			pagination: {
				pageIndex,
				pageSize,
			},
		},
		onPaginationChange: (updater) => {
			const newPagination = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
			setPageIndex(newPagination.pageIndex);
			setPageSize(newPagination.pageSize);
		},
	});

	// Check if table has no data
	const hasNoData = !tableData?.data || tableData.data.length === 0;

	if (isLoadingTableCols || isLoadingTableData) {
		return <main className="flex-1 flex items-center justify-center">Loading...</main>;
	}

	if (hasNoData) {
		return <TableEmpty />;
	}

	return (
		<div className="flex flex-col flex-1 h-full">
			<TableHeader />
			<DataGrid {...dataGridProps} table={table} className="h-full" />
			<TableFooter table={table} />
		</div>
	);
};
