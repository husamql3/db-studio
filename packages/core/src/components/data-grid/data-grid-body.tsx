import type { Row, Table } from "@tanstack/react-table";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { DataGridBodyRow } from "@/components/data-grid/data-grid-body-row";

interface DataGridBodyProps<TRow> {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<TRow>;
	tableContainerRef: RefObject<HTMLDivElement | null>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const DataGridBody = <TRow,>({
	columnVirtualizer,
	table,
	tableContainerRef,
	virtualPaddingLeft,
	virtualPaddingRight,
}: DataGridBodyProps<TRow>) => {
	const { rows } = table.getRowModel();

	const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => 33,
		getScrollElement: () => tableContainerRef.current,
		measureElement:
			typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
				? (element) => element?.getBoundingClientRect().height
				: undefined,
		overscan: 5,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();

	return (
		<tbody
			style={{
				display: "grid",
				height: `${rowVirtualizer.getTotalSize()}px`,
				position: "relative",
			}}
		>
			{virtualRows.map((virtualRow) => {
				const row = rows[virtualRow.index] as Row<TRow>;
				return (
					<DataGridBodyRow
						columnVirtualizer={columnVirtualizer}
						key={row.id}
						row={row}
						rowVirtualizer={rowVirtualizer}
						virtualPaddingLeft={virtualPaddingLeft}
						virtualPaddingRight={virtualPaddingRight}
						virtualRow={virtualRow}
					/>
				);
			})}
		</tbody>
	);
};
