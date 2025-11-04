import { useInfiniteQuery } from "@tanstack/react-query";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Plus, RefreshCcw, Save, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getTablePage, type TableRow } from "../services/get-table";
import { generateColumnsFromData } from "../utils/gen-cols-from-data";
import { Spinner } from "./spinner";

// Performance: Use Map for O(1) lookups instead of nested objects
type ChangedCells = Map<string, Record<string, unknown>>;

export const TableContent = ({ activeTable }: { activeTable: string }) => {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [rowSelection, setRowSelection] = useState({});
	const [globalFilter, setGlobalFilter] = useState("");

	// Performance: Track only changed cells, not entire rows
	const [changedCells, setChangedCells] = useState<ChangedCells>(new Map());

	const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
		queryKey: ["table", activeTable],
		queryFn: ({ pageParam }) => getTablePage(activeTable, pageParam, 50),
		initialPageParam: 1,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		getPreviousPageParam: (firstPage) => firstPage.prevCursor,
		enabled: !!activeTable,
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 10,
		refetchOnMount: true,
		refetchOnWindowFocus: false,
	});

	// Clear changes when table changes
	useEffect(() => {
		setChangedCells(new Map());
	}, []);

	const tableData = useMemo(() => {
		if (!data?.pages) return [];
		return data.pages.flatMap((page) => page.data);
	}, [data]);

	// Performance: Memoize the cell change handler to prevent re-renders
	const handleCellChange = useCallback(
		(rowId: string, columnKey: string, newValue: unknown) => {
			setChangedCells((prev) => {
				const newMap = new Map(prev);
				const rowChanges = newMap.get(rowId) || {};

				// If value is same as original, remove from changes
				const originalRow = tableData.find((_row, idx) => String(idx) === rowId);
				if (originalRow && originalRow[columnKey] === newValue) {
					delete rowChanges[columnKey];
					if (Object.keys(rowChanges).length === 0) {
						newMap.delete(rowId);
					} else {
						newMap.set(rowId, rowChanges);
					}
				} else {
					newMap.set(rowId, { ...rowChanges, [columnKey]: newValue });
				}

				return newMap;
			});
		},
		[tableData],
	);

	// Performance: Helper to get cell value (changed or original)
	const getCellValue = useCallback(
		(rowId: string, columnKey: string, originalValue: unknown) => {
			const rowChanges = changedCells.get(rowId);
			return rowChanges?.[columnKey] ?? originalValue;
		},
		[changedCells],
	);

	// Check if a specific cell has been changed
	const isCellChanged = useCallback(
		(rowId: string, columnKey: string) => {
			return changedCells.get(rowId)?.[columnKey] !== undefined;
		},
		[changedCells],
	);

	// Performance: Only regenerate columns when tableData changes
	const columns = useMemo<ColumnDef<TableRow>[]>(() => {
		if (!tableData || tableData.length === 0) {
			return [];
		}

		const selectionColumn: ColumnDef<TableRow> = {
			id: "select",
			header: ({ table }) => (
				<div className="flex items-center justify-center">
					<input
						type="checkbox"
						className="size-3.5 cursor-pointer accent-blue-500"
						checked={table.getIsAllRowsSelected()}
						onChange={table.getToggleAllRowsSelectedHandler()}
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex items-center justify-center">
					<input
						type="checkbox"
						className="size-3.5 cursor-pointer accent-blue-500"
						checked={row.getIsSelected()}
						disabled={!row.getCanSelect()}
						onChange={row.getToggleSelectedHandler()}
					/>
				</div>
			),
			size: 50,
			enableResizing: false,
		};

		return [selectionColumn, ...generateColumnsFromData(tableData, handleCellChange, getCellValue, isCellChanged)];
	}, [tableData, handleCellChange, getCellValue, isCellChanged]);

	const table = useReactTable({
		data: tableData || [],
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		defaultColumn: {
			size: 150,
			minSize: 50,
			maxSize: 500,
		},
		state: {
			rowSelection,
			globalFilter,
		},
		enableRowSelection: true,
		onRowSelectionChange: setRowSelection,
		manualPagination: true,
		pageCount: Number.POSITIVE_INFINITY,
		onPaginationChange: () => {
			fetchNextPage();
		},
		onGlobalFilterChange: setGlobalFilter,
	});

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			if (scrollHeight - scrollTop <= clientHeight * 1.2 && hasNextPage && !isFetchingNextPage) {
				fetchNextPage();
			}
		};
		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const handleAddRecord = () => {
		console.log("Add new record to:", activeTable);
		// TODO: Implement add record modal/form
	};

	const handleDeleteRecords = () => {
		const selectedRows = table.getSelectedRowModel().rows;
		console.log(
			"Delete records:",
			selectedRows.map((row) => row.original),
		);
		// TODO: Implement delete confirmation and deletion
		setRowSelection({});
	};

	const handleSaveRecords = () => {
		// Merge changes back into rows
		const updatedRows: Array<{ rowIndex: number; data: TableRow }> = [];

		changedCells.forEach((changes, rowId) => {
			const rowIndex = Number(rowId);
			const originalRow = tableData[rowIndex];
			if (originalRow) {
				updatedRows.push({
					rowIndex,
					data: { ...originalRow, ...changes },
				});
			}
		});

		console.log("Save changes:", updatedRows);
		// TODO: Implement actual save API call

		// Clear changes after save
		setChangedCells(new Map());
	};

	const selectedCount = Object.keys(rowSelection).length;
	const hasChanges = changedCells.size > 0;
	const changesCount = changedCells.size;

	if (isLoading) {
		return (
			<main className="flex-1 flex items-center justify-center">
				<Spinner size="size-6" />
			</main>
		);
	}

	if (!tableData || tableData.length === 0) {
		return (
			<main className="flex-1 flex items-center justify-center">
				<div className="text-zinc-400">No data available</div>
			</main>
		);
	}

	return (
		<main className="flex-1 flex flex-col h-full overflow-hidden">
			<div className="border-b border-zinc-800 bg-black px-4 py-3 flex items-center justify-between gap-4 w-dvw sticky">
				<div className="flex items-center gap-3 flex-1">
					{/* Refresh button */}
					<button
						type="button"
						onClick={() => refetch()}
						className="h-9 aspect-square rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors text-white flex items-center justify-center border border-zinc-700"
					>
						<RefreshCcw className="size-4" />
					</button>

					{/* Search input */}
					<div className="relative flex-1 max-w-md">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
						<input
							type="text"
							placeholder="Search all columns..."
							value={globalFilter ?? ""}
							onChange={(e) => setGlobalFilter(e.target.value)}
							className="w-full h-9 pl-9 pr-3 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
						/>
					</div>

					{/* Delete button */}
					{selectedCount > 0 && (
						<button
							type="button"
							onClick={handleDeleteRecords}
							className="h-9 px-4 rounded-md bg-red-600 hover:bg-red-700 border border-red-700 transition-colors text-sm font-medium text-white flex items-center gap-2"
						>
							Delete {selectedCount} row{selectedCount !== 1 ? "s" : ""}
						</button>
					)}

					{/* Save button - only show when there are changes */}
					{hasChanges && (
						<button
							type="button"
							onClick={handleSaveRecords}
							className="h-9 px-4 rounded-md bg-green-600 hover:bg-green-700 border border-green-700 transition-colors text-sm font-medium text-white flex items-center gap-2"
						>
							<Save className="size-4" />
							Save {changesCount} row{changesCount !== 1 ? "s" : ""}
						</button>
					)}
				</div>

				<button
					type="button"
					onClick={handleAddRecord}
					className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 transition-colors text-sm font-medium text-white flex items-center gap-2"
				>
					<Plus className="size-4" />
					Add Record
				</button>
			</div>

			{/* Table container */}
			<div ref={scrollContainerRef} className="flex-1 overflow-auto max-w-dvw">
				<table className="border-collapse ">
					<thead className="sticky top-0 z-10">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className="border-x border-b border-zinc-800 bg-black px-3 py-2.5 text-left text-sm text-zinc-300 whitespace-nowrap"
										style={{ width: header.getSize() }}
									>
										<div className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</div>
									</th>
								))}
							</tr>
						))}
					</thead>

					<tbody>
						{table.getRowModel().rows.map((row) => (
							<tr key={row.id} className="hover:bg-zinc-900/50 transition-colors">
								{row.getVisibleCells().map((cell) => (
									<td
										key={cell.id}
										className="border-x border-b border-zinc-800 text-sm text-zinc-100"
										style={{ width: cell.column.getSize() }}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
					</tbody>

					{isFetchingNextPage && (
						<tbody>
							<tr>
								<td
									colSpan={table.getAllColumns().length}
									className="border-x border-b border-zinc-800 px-3 py-2.5 text-sm text-zinc-100"
								>
									<div className="flex items-center justify-center py-4">
										<Spinner size="size-5" />
									</div>
								</td>
							</tr>
						</tbody>
					)}
				</table>
			</div>
		</main>
	);
};
