"use client";

import { flexRender } from "@tanstack/react-table";
import { type ComponentProps, type MouseEvent, useCallback } from "react";
import { DataGridColumnHeader } from "@/components/data-grid/data-grid-column-header";
import { DataGridContextMenu } from "@/components/data-grid/data-grid-context-menu";
import { DataGridRow } from "@/components/data-grid/data-grid-row";
import { DataGridSearch } from "@/components/data-grid/data-grid-search";
import type { useDataGrid } from "@/hooks/use-data-grid";
import { cn } from "@/utils/cn";

interface DataGridProps<TData> extends ReturnType<typeof useDataGrid<TData>>, ComponentProps<"div"> {}

export function DataGrid<TData>({
	dataGridRef,
	headerRef,
	rowMapRef,
	table,
	rowVirtualizer,
	searchState,
	columnSizeVars,
	onRowAdd,
	className,
	...props
}: DataGridProps<TData>) {
	const rows = table.getRowModel().rows;
	const columns = table.getAllColumns();

	const meta = table.options.meta;
	const rowHeight = meta?.rowHeight ?? "short";
	const focusedCell = meta?.focusedCell ?? null;

	const onGridContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
	}, []);

	return (
		<div data-slot="grid-wrapper" className={cn("relative flex w-full flex-col", className)} {...props}>
			{searchState && <DataGridSearch {...searchState} />}
			<DataGridContextMenu table={table} />
			<div
				role="grid"
				aria-label="Data grid"
				aria-rowcount={rows.length + (onRowAdd ? 1 : 0)}
				aria-colcount={columns.length}
				data-slot="grid"
				tabIndex={0}
				ref={dataGridRef}
				className="relative h-full grid select-none overflow-auto focus:outline-none"
				style={{
					...columnSizeVars,
				}}
				onContextMenu={onGridContextMenu}
			>
				<div
					role="rowgroup"
					data-slot="grid-header"
					ref={headerRef}
					className="sticky top-0 z-10 grid border-b border-zinc-800 bg-zinc-950"
				>
					{table.getHeaderGroups().map((headerGroup, rowIndex) => (
						<div
							key={headerGroup.id}
							role="row"
							aria-rowindex={rowIndex + 1}
							data-slot="grid-header-row"
							tabIndex={-1}
							className="flex w-full"
						>
							{headerGroup.headers.map((header, colIndex) => {
								const sorting = table.getState().sorting;
								const currentSort = sorting.find((sort) => sort.id === header.column.id);
								const isSortable = header.column.getCanSort();

								return (
									<div
										key={header.id}
										role="columnheader"
										aria-colindex={colIndex + 1}
										aria-sort={
											currentSort?.desc === false
												? "ascending"
												: currentSort?.desc === true
													? "descending"
													: isSortable
														? "none"
														: undefined
										}
										data-slot="grid-header-cell"
										tabIndex={-1}
										className={cn("relative", {
											"border-r border-zinc-800": header.column.id !== "select",
										})}
										style={{
											width: `calc(var(--header-${header.id}-size) * 1px)`,
										}}
									>
										{header.isPlaceholder ? null : typeof header.column.columnDef.header === "function" ? (
											<div className="size-full px-3 py-1.5">
												{flexRender(header.column.columnDef.header, header.getContext())}
											</div>
										) : (
											<DataGridColumnHeader header={header} table={table} />
										)}
									</div>
								);
							})}
						</div>
					))}
				</div>
				<div
					role="rowgroup"
					data-slot="grid-body"
					className="relative grid"
					style={{
						height: `${rowVirtualizer.getTotalSize()}px`,
					}}
				>
					{rowVirtualizer.getVirtualIndexes().map((virtualRowIndex) => {
						const row = rows[virtualRowIndex];
						if (!row) return null;

						return (
							<DataGridRow
								key={row.id}
								row={row}
								rowMapRef={rowMapRef}
								virtualRowIndex={virtualRowIndex}
								rowVirtualizer={rowVirtualizer}
								rowHeight={rowHeight}
								focusedCell={focusedCell}
							/>
						);
					})}
				</div>

				{/* {onRowAdd && (
					<div
						role="rowgroup"
						data-slot="grid-footer"
						ref={footerRef}
						className="sticky bottom-0 z-10 grid border-t border-zinc-800 bg-black"
					>
						<div
							role="row"
							aria-rowindex={rows.length + 2}
							data-slot="grid-add-row"
							tabIndex={-1}
							className="flex w-full"
						>
							<div
								role="gridcell"
								tabIndex={0}
								className="relative flex h-9 grow items-center bg-zinc-900 transition-colors hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
								style={{
									width: table.getTotalSize(),
									minWidth: table.getTotalSize(),
								}}
								onClick={onRowAdd}
								onKeyDown={onAddRowKeyDown}
							>
								<div className="sticky left-0 flex items-center gap-2 px-3 text-muted-foreground">
									<Plus className="size-3.5" />
									<span className="text-sm">Add row</span>
								</div>
							</div>
						</div>
					</div>
				)} */}
			</div>
		</div>
	);
}
