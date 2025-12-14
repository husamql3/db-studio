import { flexRender, type HeaderGroup, type Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { TableRecord } from "@/types/table.type";

interface TableHeadRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	headerGroup: HeaderGroup<TableRecord>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	table: Table<TableRecord>;
}

export const TableHeadRow = ({
	columnVirtualizer,
	headerGroup,
	virtualPaddingLeft,
	virtualPaddingRight,
	table,
}: TableHeadRowProps) => {
	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

	return (
		<tr
			key={headerGroup.id}
			className={cn(
				"flex w-full border-b items-center justify-between text-sm hover:bg-accent/40 data-[state=open]:bg-accent/40 [&_svg]:size-4",
				isAnyColumnResizing && "pointer-events-none",
			)}
		>
			{virtualPaddingLeft ? (
				//fake empty column to the left for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((virtualColumn) => {
				const header = headerGroup.headers[virtualColumn.index];
				return (
					<th
						key={header.id}
						className="h-full flex"
						style={{
							display: "flex",
							width: virtualColumn.index === 0 ? "40px" : header.getSize(),
						}}
					>
						<div
							{...{
								className: cn(
									"w-full h-full flex items-center justify-between gap-2 p-2 text-sm hover:bg-accent/40 data-[state=open]:bg-accent/40 [&_svg]:size-4",
									header.column.getCanSort() ? "cursor-pointer select-none" : "",
								),
								onClick: header.column.getToggleSortingHandler(),
							}}
						>
							{virtualColumn.index === 0 ? (
								flexRender(header.column.columnDef.header, header.getContext())
							) : (
								<div className="flex items-center justify-between w-full">
									<span className="text-sm leading-none">
										{flexRender(header.column.columnDef.header, header.getContext())}
									</span>
									<span className="text-xs leading-none">
										{{
											asc: " 🔼",
											desc: " 🔽",
										}[header.column.getIsSorted() as string] ?? null}
									</span>
								</div>
							)}
						</div>
					</th>
				);
			})}
			{virtualPaddingRight ? (
				//fake empty column to the right for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingRight }} />
			) : null}
		</tr>
	);
};
