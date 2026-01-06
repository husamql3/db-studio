import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type Header,
	type Table,
	useReactTable,
} from "@tanstack/react-table";
import { memo, useMemo, useState } from "react";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { TableCell } from "@/components/table-tab/table-cell";
import { TableColumnResizer } from "@/components/table-tab/table-col-resizer";
import type { TableRecord } from "@/types/table.type";
import { TableContainer } from "../table-tab/table-container";

// Memoized header component
const TableHeader = memo(
	({
		header,
		table,
	}: {
		header: Header<TableRecord, unknown>;
		table: Table<TableRecord>;
	}) => (
		<th
			key={header.id}
			className="h-full flex"
			style={{
				display: "flex",
				width: header.getSize(),
			}}
		>
			<div className="relative w-full h-full flex items-center justify-between gap-2 border-r border-zinc-700">
				{header.isPlaceholder
					? null
					: flexRender(header.column.columnDef.header, header.getContext())}
				{header.column.getCanResize() && (
					<TableColumnResizer
						header={header}
						table={table}
						label={header.column.id}
					/>
				)}
			</div>
		</th>
	),
);

TableHeader.displayName = "TableHeader";

export const TableView = ({ results }: { results: ExecuteQueryResponse | null }) => {
	const [rowSelection, setRowSelection] = useState({});
	const [columnSizing, setColumnSizing] = useState({});
	const [_focusedCell, _setFocusedCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);
	const [_editingCell, _setEditingCell] = useState<{
		rowIndex: number;
		columnId: string;
	} | null>(null);

	const columns = useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
		() => [
			// TableSelector(),
			...(results?.columns?.map((col) => ({
				accessorKey: col,
				header: col,
			})) || []),
		],
		[results?.columns],
	);

	const table = useReactTable({
		data: results?.rows ?? [],
		columns: columns as ColumnDef<Record<string, unknown>, unknown>[],
		defaultColumn: {
			cell: TableCell,
			size: 50,
			minSize: 100,
			maxSize: 500,
		},
		getCoreRowModel: getCoreRowModel(),
		// getSortedRowModel: getSortedRowModel(),
		state: {
			// sorting,
			rowSelection,
			columnSizing,
		},
		manualSorting: false,
		enableRowSelection: true,
		enableMultiRowSelection: true,
		enableColumnResizing: true,
		columnResizeMode: "onChange",
		debugTable: true,
		onRowSelectionChange: (rowSelection) => {
			setRowSelection(rowSelection);
		},
		onColumnSizingChange: setColumnSizing,
		meta: {
			// focusedCell,
			// editingCell,
			// onCellClick: (rowIndex: number, columnId: string) => {
			//   setFocusedCell({ rowIndex, columnId });
			// },
			// onCellDoubleClick: (rowIndex: number, columnId: string) => {
			//   setEditingCell({ rowIndex, columnId });
			// },
			// onCellEditingStart: (rowIndex: number, columnId: string) => {
			//   setEditingCell({ rowIndex, columnId });
			// },
			// onCellEditingStop: () => {
			//   setEditingCell(null);
			// },
			// onDataUpdate: (update: unknown) => {
			//   console.log("Data update:", update);
			// },
			// getIsCellSelected: () => false,
		},
		onPaginationChange: (pagination) => {
			console.log(pagination);
		},
		onColumnVisibilityChange: (columnVisibility) => {
			console.log(columnVisibility);
		},
		onColumnOrderChange: (columnOrder) => {
			console.log(columnOrder);
		},
	});

	return <TableContainer table={table} />;
};
// export const TableView = ({ results }: { results: ExecuteQueryResponse | null }) => {
// 	const [columnSizing, setColumnSizing] = useState({});

// 	const columns = useMemo(() => {
// 		if (!results?.columns) return [];
// 		return results.columns.map((columnName: string) => ({
// 			id: columnName,
// 			accessorKey: columnName,
// 			header: columnName,
// 			size: columnName.length * 8 + 100,
// 			minSize: 100,
// 			maxSize: 500,
// 			cell: ({ row }: { row: Row<Record<string, unknown>> }) => (
// 				<TableCell
// 					value={row.getValue(columnName)}
// 				/>
// 			),
// 		}));
// 	}, [results?.columns]);

// 	const table = useReactTable({
// 		columns: columns ?? [],
// 		data: results?.rows ?? [],
// 		getCoreRowModel: getCoreRowModel(),
// 		enableColumnResizing: true,
// 		columnResizeMode: "onChange",
// 		state: {
// 			columnSizing,
// 		},
// 		onColumnSizingChange: setColumnSizing,
// 		defaultColumn: {
// 			size: 150,
// 			minSize: 100,
// 			maxSize: 500,
// 		},
// 	});

// 	const tableContainerRef = useRef<HTMLDivElement | null>(null);
// 	const visibleColumns = table.getVisibleLeafColumns();
// 	const { rows } = table.getRowModel();

// 	// Column virtualization with optimized settings
// 	const columnVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableCellElement>({
// 		count: visibleColumns.length,
// 		estimateSize: (index) => visibleColumns[index].getSize(),
// 		getScrollElement: () => tableContainerRef.current,
// 		horizontal: true,
// 		overscan: 2, // Reduced from 3 for better performance
// 	});

// 	const virtualColumns = columnVirtualizer.getVirtualItems();

// 	const virtualPaddingLeft = useMemo(() => virtualColumns[0]?.start ?? 0, [virtualColumns]);
// 	const virtualPaddingRight = useMemo(
// 		() =>
// 			columnVirtualizer.getTotalSize() -
// 			(virtualColumns[virtualColumns.length - 1]?.end ?? 0),
// 		[columnVirtualizer, virtualColumns]
// 	);

// 	// Row virtualization with optimized settings
// 	const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
// 		count: rows.length,
// 		estimateSize: () => 33,
// 		getScrollElement: () => tableContainerRef.current,
// 		measureElement:
// 			typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
// 				? (element) => element?.getBoundingClientRect().height
// 				: undefined,
// 		overscan: 3, // Reduced from 5 for better performance
// 	});

// 	const virtualRows = rowVirtualizer.getVirtualItems();
// 	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

// 	if (!results) return null;

// 	return (
// 		<div
// 			className="w-full flex-1 overflow-auto"
// 			ref={tableContainerRef}
// 			style={{
// 				position: "relative",
// 			}}
// 		>
// 			<table style={{ display: "grid" }}>
// 				<thead className="h-9 grid sticky top-0 z-10">
// 					{table.getHeaderGroups().map((headerGroup) => (
// 						<tr
// 							key={headerGroup.id}
// 							className={cn(
// 								"flex w-fit bg-zinc-900 backdrop-blur-sm border-b items-center justify-between text-xs font-semibold text-zinc-300 tracking-wider shadow-sm",
// 								isAnyColumnResizing && "pointer-events-none",
// 							)}
// 						>
// 							{virtualPaddingLeft ? (
// 								<th style={{ display: "flex", width: virtualPaddingLeft }} />
// 							) : null}
// 							{virtualColumns.map((virtualColumn) => {
// 								const header = headerGroup.headers[virtualColumn.index];
// 								return (
// 									<TableHeader
// 										key={header.id}
// 										header={header}
// 										table={table}
// 									/>
// 								);
// 							})}
// 							{virtualPaddingRight ? (
// 								<th style={{ display: "flex", width: virtualPaddingRight }} />
// 							) : null}
// 						</tr>
// 					))}
// 				</thead>
// 				<tbody
// 					style={{
// 						display: "grid",
// 						height: `${rowVirtualizer.getTotalSize()}px`,
// 						position: "relative",
// 					}}
// 				>
// 					{rows.length ? (
// 						virtualRows.map((virtualRow) => {
// 							const row = rows[virtualRow.index] as Row<Record<string, unknown>>;
// 							const visibleCells = row.getVisibleCells();

// 							return (
// 								<tr
// 									key={row.id}
// 									data-index={virtualRow.index}
// 									ref={(node) => rowVirtualizer.measureElement(node)}
// 									className="flex absolute w-fit border-b items-center justify-between text-xs hover:bg-accent/20"
// 									style={{
// 										transform: `translateY(${virtualRow.start}px)`,
// 									}}
// 								>
// 									{virtualPaddingLeft ? (
// 										<td style={{ display: "flex", width: virtualPaddingLeft }} />
// 									) : null}
// 									{virtualColumns.map((vc) => {
// 										const cell = visibleCells[vc.index];
// 										return (
// 											<td
// 												key={cell.id}
// 												className="flex border-r border-zinc-800 h-8"
// 												style={{
// 													width: cell.column.getSize(),
// 												}}
// 											>
// 												{flexRender(cell.column.columnDef.cell, cell.getContext())}
// 											</td>
// 										);
// 									})}
// 									{virtualPaddingRight ? (
// 										<td style={{ display: "flex", width: virtualPaddingRight }} />
// 									) : null}
// 								</tr>
// 							);
// 						})
// 					) : (
// 						<tr className="flex absolute w-full items-center justify-center">
// 							<td className="h-24 text-center w-full flex items-center justify-center">
// 								No results.
// 							</td>
// 						</tr>
// 					)}
// 				</tbody>
// 			</table>
// 		</div>
// 	);
// };
