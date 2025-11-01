import { useInfiniteQuery } from "@tanstack/react-query";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "../hooks/use-search-params";
import { getTablePage, type TableRow } from "../services/get-table";
import { Spinner } from "./spinner";

const generateColumnsFromData = (data: TableRow[]): ColumnDef<TableRow>[] => {
	if (!data || data.length === 0) {
		return [];
	}

	const firstRow = data[0];
	const keys = Object.keys(firstRow);

	return keys.map((key) => ({
		accessorKey: key,
		header: key,
		cell: (info) => {
			const value = info.getValue();
			// Format dates
			if (value instanceof Date) {
				return value.toLocaleString();
			}
			// Format objects
			if (typeof value === "object" && value !== null) {
				return JSON.stringify(value);
			}
			return <span className="truncate block max-w-full">{String(value ?? "")}</span>;
		},
		// size: 50,
		// minSize: 80,
		maxSize: 50,
		// enableResizing: true,
	}));
};

export const MainView = () => {
	const { activeTable } = useSearchParams();

	if (!activeTable) {
		return (
			<main className="flex-1 flex items-center justify-center">
				<div className="text-zinc-400">Select a table to view</div>
			</main>
		);
	}

	return <TableContent key={activeTable} activeTable={activeTable} />;
};

const TableContent = ({ activeTable }: { activeTable: string }) => {
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
		queryKey: ["table", activeTable],
		queryFn: ({ pageParam }) => getTablePage(activeTable, pageParam, 50),
		initialPageParam: 1,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		getPreviousPageParam: (firstPage) => firstPage.prevCursor,
		enabled: !!activeTable,
		staleTime: 0,
		gcTime: 0,
		refetchOnMount: true,
		refetchOnWindowFocus: false,
	});

	// Flatten all pages into a single array
	const tableData = useMemo(() => {
		if (!data?.pages) return [];
		return data.pages.flatMap((page) => page.data);
	}, [data]);

	const columns = useMemo<ColumnDef<TableRow>[]>(() => {
		if (!tableData || tableData.length === 0) {
			return [];
		}
		return generateColumnsFromData(tableData);
	}, [tableData]);

	const table = useReactTable({
		data: tableData || [],
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		autoResetAll: true,
		manualPagination: true,
		pageCount: Infinity,
		onPaginationChange: (pagination) => {
			console.log("Pagination changed:", pagination);
			fetchNextPage();
		},
	});

	// Scroll detection for infinite loading
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			// Trigger fetch when user scrolls to 80% of the content
			if (scrollHeight - scrollTop <= clientHeight * 1.2 && hasNextPage && !isFetchingNextPage) {
				console.log("Fetching next page...");
				fetchNextPage();
			}
		};

		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	console.log(
		"React Table columns:",
		table.getAllColumns().map((c) => c.id),
	);
	console.log("Total rows loaded:", tableData.length);

	// NOW do early returns - AFTER all hooks have been called
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
		<main ref={scrollContainerRef} className="flex-1 w-full overflow-auto">
			<table key={activeTable} className="border-collapse w-fit">
				<thead className="sticky top-0 z-10">
					{table.getHeaderGroups().map((headerGroup) => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<th
									key={header.id}
									className="border-x border-b border-zinc-800 bg-black px-2 py-2 text-left text-sm font-medium text-zinc-100 relative whitespace-nowrap overflow-hidden"
									style={{ width: header.getSize() }}
								>
									<div className="truncate pr-2">{flexRender(header.column.columnDef.header, header.getContext())}</div>
									<button
										type="button"
										onMouseDown={header.getResizeHandler()}
										onTouchStart={header.getResizeHandler()}
										className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-blue-500 ${header.column.getIsResizing() ? "bg-blue-500" : ""}`}
									/>
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
									className="border border-zinc-800 px-2 py-2 text-sm text-zinc-100 overflow-hidden"
									style={{ width: cell.column.getSize() }}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</td>
							))}
						</tr>
					))}

					{/* Loading indicator for next page */}
					{isFetchingNextPage && (
						<tr>
							<td colSpan={columns.length} className="text-center py-8">
								<div className="flex items-center justify-center">
									<Spinner size="size-5" />
								</div>
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</main>
	);
};
