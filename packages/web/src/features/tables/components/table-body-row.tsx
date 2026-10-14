import { cn } from "@db-studio/ui/utils";
import { flexRender, type Row, type TableMeta, type TableState } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { memo } from "react";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { useDelayedRowOpen } from "../hooks/use-delayed-row-open";
import { useLiveModeStore } from "../stores/live-mode.store";
import { useRowDetailsStore } from "../stores/row-details.store";
import { CellCopyButton } from "./cell-copy-button";

interface TableBodyRowProps {
	row: Row<TableRecord>;
	tableName: string;
	/**
	 * Not read here, but what the cells read through the table: selection, column sizes and
	 * order, the focused and edited cell. New values re-render the row.
	 */
	tableState: TableState;
	tableMeta: TableMeta<TableRecord> | undefined;
	virtualColumns: VirtualItem[];
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	virtualRow: VirtualItem;
}

/**
 * Memoized so a vertical scroll renders only the rows coming into view; before, every visible
 * row and cell re-rendered on each scroll frame.
 */
export const TableBodyRow = memo(function TableBodyRow({
	row,
	tableName,
	virtualColumns,
	virtualPaddingLeft,
	virtualPaddingRight,
	virtualRow,
}: TableBodyRowProps) {
	const visibleCells = row.getVisibleCells();
	const { schedule, cancel } = useDelayedRowOpen();
	const { highlightedRowIds } = useLiveModeStore();
	const isRowHighlighted = highlightedRowIds.has(row.id);

	const openRowDetails = () => {
		useRowDetailsStore.getState().setRowDetails(tableName, virtualRow.index);
		useOverlayStore.getState().openOverlay("tables.row-details");
	};

	return (
		<tr
			data-index={virtualRow.index}
			key={row.id}
			className={cn(
				"flex absolute w-fit border-b items-center justify-between text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4",
				isRowHighlighted &&
					"bg-emerald-500/15 dark:bg-emerald-500/20 transition-colors duration-1000 ease-in-out",
			)}
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
});
