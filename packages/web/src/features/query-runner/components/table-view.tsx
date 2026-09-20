import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { flexRender, getCoreRowModel, type Row, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { formatCellValue } from "@/utils/format-cell-value";

export const TableView = ({ results }: { results: ExecuteQueryResult | null }) => {
	const columns = useMemo(() => {
		if (!results?.columns) return [];

		return results.columns.map((item: string) => ({
			id: item,
			accessorKey: item,
			header: item,
			cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
				<div className="font-medium truncate text-foreground">
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

	const totalTableWidth = table.getAllColumns().reduce((sum, col) => sum + col.getSize(), 0);

	return (
		<div
			ref={parentRef}
			className="relative h-full overflow-auto w-full bg-background text-foreground"
		>
			<div
				className="sticky top-0 z-20 bg-muted/40 border-b border-border"
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
								className="shrink-0 p-2 font-semibold text-muted-foreground border-r border-border relative"
								style={{ width: `${header.getSize()}px` }}
							>
								{header.isPlaceholder
									? null
									: flexRender(header.column.columnDef.header, header.getContext())}

								<div
									role="presentation"
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
								height: `${virtualRow.size}px`,
								transform: `translateY(${virtualRow.start}px)`,
							}}
							className="flex text-xs border-b border-border hover:bg-accent/20"
						>
							{row.getVisibleCells().map((cell) => (
								<div
									key={cell.id}
									className="shrink-0 p-2 border-r border-border"
									style={{ width: `${cell.column.getSize()}px` }}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							))}
						</div>
					);
				})}
			</div>

			{rows.length === 0 && (
				<div className="flex items-center justify-center h-24 text-muted-foreground">
					No results.
				</div>
			)}
		</div>
	);
};
