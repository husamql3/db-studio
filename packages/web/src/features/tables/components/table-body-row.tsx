import { cn } from "@db-studio/ui/utils";
import { flexRender, type Row, type TableMeta, type TableState } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { Maximize2 } from "lucide-react";
import { memo } from "react";
import type { TableRecord } from "@/types/table.type";
import { useLiveModeStore } from "../stores/live-mode.store";
import { CellCopyButton } from "./cell-copy-button";

interface TableBodyRowProps {
	row: Row<TableRecord>;
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
	/** The row menu is open for this row. */
	isMenuOpen: boolean;
}

/**
 * Memoized so a vertical scroll renders only the rows coming into view; before, every visible
 * row and cell re-rendered on each scroll frame.
 */
export const TableBodyRow = memo(function TableBodyRow({
	row,
	tableMeta,
	virtualColumns,
	virtualPaddingLeft,
	virtualPaddingRight,
	virtualRow,
	isMenuOpen,
}: TableBodyRowProps) {
	const visibleCells = row.getVisibleCells();
	const { highlightedRowIds } = useLiveModeStore();
	const isRowHighlighted = highlightedRowIds.has(row.id);

	return (
		<tr
			data-index={virtualRow.index}
			data-state={isMenuOpen ? "open" : undefined}
			key={row.id}
			className={cn(
				"group/row flex absolute w-fit border-b items-center justify-between text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4",
				isRowHighlighted &&
					"bg-emerald-500/15 dark:bg-emerald-500/20 transition-colors duration-1000 ease-in-out",
			)}
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
						className="group relative flex border-r border-border h-8"
						style={{
							width: vc.index === 0 ? "64px" : cell.column.getSize(),
							// height: "33px",
						}}
					>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
						{vc.index === 0 ? (
							<button
								type="button"
								className="absolute right-1 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/row:opacity-100"
								onClick={() => tableMeta?.onRowDetailsOpen?.(virtualRow.index)}
								aria-label="Open row details"
								title="Open row details (Space)"
							>
								<Maximize2 className="size-3.5!" />
							</button>
						) : (
							<CellCopyButton value={cell.getValue()} />
						)}
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
