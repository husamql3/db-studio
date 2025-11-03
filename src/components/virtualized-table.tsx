import { flexRender, type Table as TableType } from "@tanstack/react-table";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { List, type ListImperativeAPI } from "react-window";
import type { TableRow } from "../services/get-table";

interface VirtualizedTableProps {
	table: TableType<TableRow>;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	onLoadMore: () => void;
	spinnerComponent?: ReactNode;
}

const ROW_HEIGHT = 41; // Height of each row in pixels (py-2.5 + borders)

export const VirtualizedTable = ({
	table,
	isFetchingNextPage,
	hasNextPage,
	onLoadMore,
	spinnerComponent,
}: VirtualizedTableProps) => {
	const listRef = useRef<ListImperativeAPI>(null);
	const containerRef = useRef<HTMLDivElement>(null); // Add this
	const [containerHeight, setContainerHeight] = useState(600); // Add this
	const rows = table.getRowModel().rows;
	const headers = table.getHeaderGroups()[0]?.headers || [];

	// Add this useEffect to measure container height
	useEffect(() => {
		const updateHeight = () => {
			if (containerRef.current) {
				const height = containerRef.current.clientHeight;
				setContainerHeight(height - 41); // Subtract header height
			}
		};

		updateHeight();
		window.addEventListener("resize", updateHeight);
		return () => window.removeEventListener("resize", updateHeight);
	}, []);

	// Handle visible rows change for infinite loading
	const handleRowsRendered = (visibleRows: { startIndex: number; stopIndex: number }) => {
		// Load more when we're within 10 rows of the end
		const isNearEnd = visibleRows.stopIndex >= rows.length - 10;

		if (isNearEnd && hasNextPage && !isFetchingNextPage) {
			onLoadMore();
		}
	};

	// Row renderer for react-window
	const RowComponent = ({ index, style }: { index: number; style: CSSProperties }) => {
		const row = rows[index];

		return (
			<div style={style} className="hover:bg-zinc-900/50 transition-colors flex">
				{row.getVisibleCells().map((cell) => (
					<div
						key={cell.id}
						className="border-x border-b border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 flex items-center"
						style={{
							width: cell.column.getSize(),
							minWidth: cell.column.getSize(),
							maxWidth: cell.column.getSize(),
						}}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</div>
				))}
			</div>
		);
	};

	return (
		<div ref={containerRef} className="flex flex-col h-full">
			{" "}
			{/* Add ref here */}
			{/* Fixed Header */}
			<div className="flex bg-black border-b border-zinc-800">
				{" "}
				{/* Remove sticky */}
				{headers.map((header) => (
					<div
						key={header.id}
						className="border-x border-zinc-800 px-3 py-2.5 text-left text-sm text-zinc-300 whitespace-nowrap"
						style={{
							width: header.getSize(),
							minWidth: header.getSize(),
							maxWidth: header.getSize(),
						}}
					>
						<div className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</div>
					</div>
				))}
			</div>
			{/* Virtualized Rows */}
			<List<Record<string, never>>
				listRef={listRef}
				rowComponent={RowComponent}
				rowCount={rows.length}
				rowHeight={ROW_HEIGHT}
				rowProps={{}}
				onRowsRendered={handleRowsRendered}
				style={{ height: containerHeight, width: "100%" }}
			/>
			{/* Loading Indicator */}
			{isFetchingNextPage && (
				<div className="border-x border-b border-zinc-800 px-3 py-4 flex items-center justify-center">
					{spinnerComponent || <div className="text-zinc-400">Loading...</div>}
				</div>
			)}
		</div>
	);
};
