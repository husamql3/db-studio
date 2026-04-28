import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { CellCopyButton } from "@/components/table-tab/cell-copy-button";

interface DataGridBodyRowProps<TRow> {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
  row: Row<TRow>;
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
  virtualPaddingLeft: number | undefined;
  virtualPaddingRight: number | undefined;
  virtualRow: VirtualItem;
}

export const DataGridBodyRow = <TRow,>({
  columnVirtualizer,
  row,
  rowVirtualizer,
  virtualPaddingLeft,
  virtualPaddingRight,
  virtualRow,
}: DataGridBodyRowProps<TRow>) => {
  const visibleCells = row.getVisibleCells();
  const virtualColumns = columnVirtualizer.getVirtualItems();

  return (
    <tr
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      key={row.id}
      className="flex absolute w-fit border-b items-center text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4"
      style={{
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {virtualPaddingLeft ? (
        <td style={{ display: "flex", width: virtualPaddingLeft }} />
      ) : null}
      {virtualColumns.map((vc) => {
        const cell = visibleCells[vc.index];
        return (
          <td
            key={cell.id}
            className="group relative flex border-r border-zinc-800 h-8 items-center px-3 truncate"
            style={{ width: cell.column.getSize() }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
            <CellCopyButton value={cell.getValue()} />
          </td>
        );
      })}
      {virtualPaddingRight ? (
        <td style={{ display: "flex", width: virtualPaddingRight }} />
      ) : null}
    </tr>
  );
};
