import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useDataGrid } from "@/hooks/use-data-grid";
import { useTableData } from "@/hooks/use-table-data";
import { queries } from "@/providers/queries";
import { useActiveTableStore } from "@/stores/active-table.store";
import { getCellVariant } from "@/utils/table-grid.helpers";
import { DataGrid } from "../data-grid/data-grid";
import { Spinner } from "../ui/spinner";
import { TableHeader } from "./header/table-header";
import { TableEmpty } from "./table-empty";
import { TableFooter } from "./table-footer";

export const TableView = () => {
	const {
		activeTable,
		page,
		pageSize,
		sortColumn,
		sortOrder,
		setPage,
		setPageSize,
		setSorting,
	} = useActiveTableStore();

	const { data: tableCols, isLoading: isLoadingTableCols } = useQuery(
		queries.tableCols(activeTable ?? ""),
	);
	const { tableData, isLoadingTableData } = useTableData(activeTable);

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
		pageCount: tableData?.meta.totalPages ?? 0,
		state: {
			pagination: {
				pageIndex: page - 1,
				pageSize,
			},
			sorting: sortColumn ? [{ id: sortColumn, desc: sortOrder === "desc" }] : [],
		},
		onPaginationChange: (updater) => {
			const currentPagination = { pageIndex: page - 1, pageSize };
			const newPagination =
				typeof updater === "function" ? updater(currentPagination) : updater;

			if (newPagination.pageSize !== pageSize) {
				setPageSize(newPagination.pageSize);
			} else {
				setPage(newPagination.pageIndex + 1);
			}
		},
		onSortingChange: (updater) => {
			const currentSorting = sortColumn
				? [{ id: sortColumn, desc: sortOrder === "desc" }]
				: [];
			const newSorting =
				typeof updater === "function" ? updater(currentSorting) : updater;

			if (newSorting.length > 0) {
				setSorting(newSorting[0].id, newSorting[0].desc ? "desc" : "asc");
			} else {
				setSorting(null, "asc");
			}
		},
	});

	// Check if table has no data
	const hasNoData = !tableData?.data || tableData.data.length === 0;

	if (isLoadingTableCols || isLoadingTableData) {
		return (
			<main className="flex-1 flex items-center justify-center">
				<Spinner size="size-8" />
			</main>
		);
	}

	if (hasNoData) {
		return (
			<div className="flex flex-col flex-1 h-full">
				<TableHeader />
				<TableEmpty />
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 h-full">
			<TableHeader />
			<DataGrid
				{...dataGridProps}
				table={table}
				className="h-full"
			/>
			<TableFooter />
		</div>
	);
};
