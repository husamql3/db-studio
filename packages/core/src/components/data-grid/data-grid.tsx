import { flexRender } from "@tanstack/react-table";
import { type ComponentProps, useCallback } from "react";
import { DataGridColumnHeader } from "@/components/data-grid/data-grid-column-header";
import { DataGridContextMenu } from "@/components/data-grid/data-grid-context-menu";
import { DataGridRow } from "@/components/data-grid/data-grid-row";
import { DataGridSearch } from "@/components/data-grid/data-grid-search";
import type { useDataGrid } from "@/hooks/use-data-grid";
import { cn } from "@/utils/cn";

interface DataGridProps<TData>
	extends ReturnType<typeof useDataGrid<TData>>,
		ComponentProps<"div"> {}

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
	const focusedCell = meta?.focusedCell ?? null;

	const onGridContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
	}, []);

	return (
		<div
			data-slot="grid-wrapper"
			className={cn("relative overflow-hidden flex h-full w-full flex-col", className)}
			{...props}
		>
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
				className="relative h-fit w-full grid select-none overflow-y-auto focus:outline-none"
				style={{ ...columnSizeVars }}
				onContextMenu={onGridContextMenu}
			>
				<div
					role="rowgroup"
					data-slot="grid-header"
					ref={headerRef}
					className="sticky top-0 z-10 grid border-b border-zinc-800 bg-zinc-950 max-h-9"
				>
					{table.getHeaderGroups().map((headerGroup, rowIndex) => (
						<div
							key={headerGroup.id}
							role="row"
							aria-rowindex={rowIndex + 1}
							data-slot="grid-header-row"
							tabIndex={-1}
							className="flex w-full h-fit max-h-9"
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
										{header.isPlaceholder ? null : typeof header.column.columnDef
												.header === "function" ? (
											<div className="px-3 py-1.5">
												{flexRender(header.column.columnDef.header, header.getContext())}
											</div>
										) : (
											<DataGridColumnHeader
												header={header}
												table={table}
											/>
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
								focusedCell={focusedCell}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}
