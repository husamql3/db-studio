import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { useDataGrid } from "@/hooks/use-data-grid";
import { useTableData } from "@/hooks/use-table-data";
import { queries } from "@/providers/queries";
import { useActiveTableStore } from "@/stores/active-table.store";
import { useTableReloadStore } from "@/stores/table-reload.store";
import { getCellVariant } from "@/utils/table-grid.helpers";
import { DataGrid } from "../data-grid/data-grid";
import { Checkbox } from "../ui/checkbox";
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
		selectedRowIndices,
		setPage,
		setPageSize,
		setSorting,
		setSelectedRowIndices,
		clearRowSelection,
	} = useActiveTableStore();
	const { data: tableCols, isLoading: isLoadingTableCols } = useQuery(
		queries.tableCols(activeTable ?? ""),
	);
	const { tableData, isLoadingTableData, isRefetchingTableData } =
		useTableData(activeTable);

	// Get reload key from store for force remounting
	const { reloadKey } = useTableReloadStore();

	const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
		return [
			{
				id: "select",
				accessorKey: "select",
				header: ({ table }) => (
					<Checkbox
						checked={table.getIsAllRowsSelected()}
						onCheckedChange={() => table.toggleAllRowsSelected()}
						size="sm"
					/>
				),
				cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={() => row.toggleSelected()}
						size="sm"
					/>
				),
				size: 20,
			},
			...(tableCols?.map((col) => ({
				id: col.columnName,
				accessorKey: col.columnName,
				header: col.columnName,
				meta: {
					cell: getCellVariant(col.dataType),
					dataTypeLabel: col.dataTypeLabel,
					isPrimaryKey: col.isPrimaryKey,
				},
				minSize: 150,
			})) ?? []),
		];
	}, [tableCols]);

	// Convert number[] to RowSelectionState (using row index as ID)
	const rowSelection = useMemo<RowSelectionState>(() => {
		const selection: RowSelectionState = {};
		for (const index of selectedRowIndices) {
			selection[String(index)] = true;
		}
		return selection;
	}, [selectedRowIndices]);

	// Handle row selection changes from the data grid
	const handleRowSelectionChange = useCallback(
		(updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
			const newSelection =
				typeof updater === "function" ? updater(rowSelection) : updater;
			const newIndices: number[] = [];
			for (const [key, isSelected] of Object.entries(newSelection)) {
				if (isSelected) {
					newIndices.push(Number(key));
				}
			}
			setSelectedRowIndices(newIndices);
		},
		[rowSelection, setSelectedRowIndices],
	);

	const { table, rowVirtualizer, ...dataGridProps } = useDataGrid({
		columns,
		data: tableData?.data ?? [],
		enableSearch: true,
		enableRowSelection: true,
		onRowSelectionChange: handleRowSelectionChange,
		// server-side pagination
		manualPagination: true,
		pageCount: tableData?.meta.totalPages ?? 0,
		state: {
			pagination: {
				pageIndex: page - 1,
				pageSize,
			},
			sorting: sortColumn ? [{ id: sortColumn, desc: sortOrder === "desc" }] : [],
			rowSelection,
		},
		onPaginationChange: (updater) => {
			// Clear row selection when changing pages
			clearRowSelection();
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
			// Clear row selection when sorting changes
			clearRowSelection();
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
		debugTable: true,
	});

	// Check if table has no data
	const hasNoData = !tableData?.data || tableData.data.length === 0;

	if (isLoadingTableCols || isLoadingTableData || isRefetchingTableData) {
		return (
			<main className="flex flex-col flex-1 h-full">
				<TableHeader
					table={table}
					rowVirtualizer={rowVirtualizer}
				/>
				<div className="flex-1 flex items-center justify-center">
					<Spinner size="size-8" />
				</div>
			</main>
		);
	}

	if (hasNoData) {
		return (
			<main className="flex flex-col flex-1 h-full">
				<TableHeader
					table={table}
					rowVirtualizer={rowVirtualizer}
				/>
				<TableEmpty />
			</main>
		);
	}

	return (
		<main className="flex flex-col flex-1 h-full">
			<TableHeader
				table={table}
				rowVirtualizer={rowVirtualizer}
			/>
			<DataGrid
				key={reloadKey}
				{...dataGridProps}
				table={table}
				rowVirtualizer={rowVirtualizer}
				className="h-full"
			/>
			<TableFooter />
		</main>
	);
};
