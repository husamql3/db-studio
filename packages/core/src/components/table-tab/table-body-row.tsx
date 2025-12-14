import type { Row } from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { TableBodyCell } from "@/components/table-tab/table-body-cell";

interface TableBodyRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	row: Row<Record<string, unknown>>;
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
			style={{
				display: "flex",
				position: "absolute",
				transform: `translateY(${virtualRow.start}px)`, //this should always be a `style` as it changes on scroll
				width: "100%",
			}}
		>
			{virtualPaddingLeft ? (
				//fake empty column to the left for virtualization scroll padding
				<td style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((vc) => {
				const cell = visibleCells[vc.index];
				return (
					<TableBodyCell
						key={cell.id}
						cell={cell}
					/>
				);
			})}
			{virtualPaddingRight ? (
				//fake empty column to the right for virtualization scroll padding
				<td style={{ display: "flex", width: virtualPaddingRight }} />
			) : null}
		</tr>
	);
};
