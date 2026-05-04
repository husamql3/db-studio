import { flexRender, type Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { cn } from "../../utils";
import { DataGridColumnResizer } from "./data-grid-col-resizer";

interface DataGridHeadProps<TRow> {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<TRow>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const DataGridHead = <TRow,>({
	columnVirtualizer,
	table,
	virtualPaddingLeft,
	virtualPaddingRight,
}: DataGridHeadProps<TRow>) => {
	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

	return (
		<thead className="h-9 grid sticky top-0 z-10">
			{table.getHeaderGroups().map((headerGroup) => (
				<tr
					key={headerGroup.id}
					className={cn(
						"flex w-fit bg-black border-b border-zinc-800 items-center text-sm [&_svg]:size-4",
						isAnyColumnResizing && "pointer-events-none",
					)}
				>
					{virtualPaddingLeft ? (
						<th style={{ display: "flex", width: virtualPaddingLeft }} />
					) : null}
					{virtualColumns.map((virtualColumn) => {
						const header = headerGroup.headers[virtualColumn.index];
						return (
							<th
								key={header.id}
								className="relative h-full flex items-center border-r border-zinc-800 text-xs font-medium text-zinc-500"
								style={{ width: header.getSize() }}
							>
								<div className="flex w-full h-full items-center px-3">
									{flexRender(header.column.columnDef.header, header.getContext())}
								</div>
								{header.column.getCanResize() && (
									<DataGridColumnResizer
										header={header}
										table={table}
										label={header.column.id}
									/>
								)}
							</th>
						);
					})}
					{virtualPaddingRight ? (
						<th style={{ display: "flex", width: virtualPaddingRight }} />
					) : null}
				</tr>
			))}
		</thead>
	);
};
