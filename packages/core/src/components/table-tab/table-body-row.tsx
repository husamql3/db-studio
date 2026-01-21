import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type { TableRecord } from "shared/types";
import { cn } from "@/lib/utils";

interface TableBodyRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	row: Row<TableRecord>;
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	virtualRow: VirtualItem;
}

export const TableBodyRow = ({
	columnVirtualizer,
	row,
	rowVirtualizer,
	virtualPaddingLeft,
	virtualPaddingRight,
	virtualRow,
}: TableBodyRowProps) => {
	const visibleCells = row.getVisibleCells();
	const virtualColumns = columnVirtualizer.getVirtualItems();
	return (
		<tr
			data-index={virtualRow.index} //needed for dynamic row height measurement
			ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
			key={row.id}
			className="flex absolute w-fit border-b items-center justify-between text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4"
			style={{
				transform: `translateY(${virtualRow.start}px)`, //this should always be a `style` as it changes on scroll
			}}
		>
			{virtualPaddingLeft ? (
				// fake empty column to the left for virtualization scroll padding
				<td style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((vc) => {
				const cell = visibleCells[vc.index];
				return (
					<td
						key={cell.id}
						className={cn("flex border-r border-zinc-800 h-8")}
						style={{
							width: vc.index === 0 ? "40px" : cell.column.getSize(),
							// height: "33px",
						}}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</td>
				);
			})}
			{virtualPaddingRight ? (
				// fake empty column to the right for virtualization scroll padding
				<td style={{ display: "flex", width: virtualPaddingRight }} />
			) : null}
		</tr>
	);
};
