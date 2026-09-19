import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { useDelayedRowOpen } from "../hooks/use-delayed-row-open";
import { useRowDetailsStore } from "../stores/row-details.store";
import { CellCopyButton } from "./cell-copy-button";

interface TableBodyRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	row: Row<TableRecord>;
	tableName: string;
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	virtualRow: VirtualItem;
}

export const TableBodyRow = ({
	columnVirtualizer,
	row,
	tableName,
	rowVirtualizer,
	virtualPaddingLeft,
	virtualPaddingRight,
	virtualRow,
}: TableBodyRowProps) => {
	const visibleCells = row.getVisibleCells();
	const virtualColumns = columnVirtualizer.getVirtualItems();
	const { schedule, cancel } = useDelayedRowOpen();

	const openRowDetails = () => {
		useRowDetailsStore.getState().setRowDetails(tableName, virtualRow.index);
		useOverlayStore.getState().openOverlay("tables.row-details");
	};

	return (
		<tr
			data-index={virtualRow.index} //needed for dynamic row height measurement
			ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
			key={row.id}
			className="flex absolute w-fit border-b items-center justify-between text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4"
			style={{
				transform: `translateY(${virtualRow.start}px)`, //this should always be a `style` as it changes on scroll
			}}
			onClick={(event) => {
				// Ordinary row content opens the details sheet. Interactive
				// elements (their own handlers stop propagation as well) and
				// editor surfaces never do.
				const target = event.target as HTMLElement;
				if (
					target.closest(
						"button, a, input, textarea, select, [role=checkbox], [role=listbox], [role=dialog], [data-grid-cell-editor]",
					)
				) {
					return;
				}
				schedule(openRowDetails);
			}}
			// A double-click starts inline cell editing instead (handled by
			// the cell wrapper), so it cancels the pending sheet.
			onDoubleClick={cancel}
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
						className="group relative flex border-r border-border h-8"
						style={{
							width: vc.index === 0 ? "40px" : cell.column.getSize(),
							// height: "33px",
						}}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
						<CellCopyButton value={cell.getValue()} />
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
