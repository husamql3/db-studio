import {
	flexRender,
	getCoreRowModel,
	type Row,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { formatCellValue } from "@/utils/format-cell-value";

export const TableView = ({ results }: { results: ExecuteQueryResponse | null }) => {
	const columns = useMemo(() => {
		if (!results?.columns) return [];

		return results.columns.map((item) => ({
			id: item,
			accessorKey: item,
			header: item,
			cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
				<div className="font-medium truncate text-gray-200">
					{formatCellValue(row.getValue(item))}
				</div>
			),
		}));
	}, [results?.columns]);

	const table = useReactTable({
		columns: columns,
		data: results?.rows ?? [],
		getCoreRowModel: getCoreRowModel(),
		columnResizeMode: "onChange",
		enableColumnResizing: true,
	});

	const { rows } = table.getRowModel();

	const parentRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 35,
		overscan: 10,
	});

	const items = virtualizer.getVirtualItems();

	// Calculate total table width based on actual column sizes
	const totalTableWidth = table
		.getAllColumns()
		.reduce((sum, col) => sum + col.getSize(), 0);

	return (
		<div
			ref={parentRef}
			className="relative h-full overflow-auto w-full"
		>
			{/* Header */}
			<div
				className="sticky top-0 z-20 bg-black border-b border-zinc-800"
				style={{ width: `${totalTableWidth}px`, minWidth: "100%" }}
			>
				{table.getHeaderGroups().map((headerGroup) => (
					<div
						key={headerGroup.id}
						className="flex text-xs"
					>
						{headerGroup.headers.map((header) => (
							<div
								key={header.id}
								className="shrink-0 px-2 py-2 font-semibold text-gray-300 border-r border-zinc-800 relative"
								style={{ width: `${header.getSize()}px` }}
							>
								{header.isPlaceholder
									? null
									: flexRender(header.column.columnDef.header, header.getContext())}

								{/* Resize Handle */}
								<div
									onMouseDown={header.getResizeHandler()}
									onTouchStart={header.getResizeHandler()}
									className={`absolute top-0 right-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-blue-500 ${
										header.column.getIsResizing() ? "bg-blue-500" : ""
									}`}
								/>
							</div>
						))}
					</div>
				))}
			</div>

			{/* Virtualized Body */}
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: `${totalTableWidth}px`,
					minWidth: "100%",
					position: "relative",
				}}
			>
				{items.map((virtualRow) => {
					const row = rows[virtualRow.index];
					return (
						<div
							key={row.id}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: `${totalTableWidth}px`,
								minWidth: "100%",
								height: `${virtualRow.size}px - 5px`,
								transform: `translateY(${virtualRow.start}px)`,
							}}
							className="flex text-xs border-b border-zinc-800 hover:bg-zinc-800/50"
						>
							{row.getVisibleCells().map((cell) => (
								<div
									key={cell.id}
									className="shrink-0 px-2 py-2 border-r border-zinc-800"
									style={{ width: `${cell.column.getSize()}px` }}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							))}
						</div>
					);
				})}
			</div>

			{/* No Results Message */}
			{rows.length === 0 && (
				<div className="flex items-center justify-center h-24 text-gray-400">
					No results.
				</div>
			)}
		</div>
	);
};
