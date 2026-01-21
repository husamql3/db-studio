import type { Row, Table } from "@tanstack/react-table";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import type { TableRecord } from "shared/types";
import { TableBodyRow } from "@/components/table-tab/table-body-row";

interface TableBodyProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<TableRecord>;
	tableContainerRef: RefObject<HTMLDivElement | null>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const TableBody = ({
	columnVirtualizer,
	table,
	tableContainerRef,
	virtualPaddingLeft,
	virtualPaddingRight,
}: TableBodyProps) => {
	const { rows } = table.getRowModel();

	//dynamic row height virtualization - alternatively you could use a simpler fixed row height strategy without the need for `measureElement`
	const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => 33, //estimate row height for accurate scrollbar dragging
		getScrollElement: () => tableContainerRef.current,
		//measure dynamic row height, except in firefox because it measures table border height incorrectly
		measureElement:
			typeof window !== "undefined" &&
			navigator.userAgent.indexOf("Firefox") === -1
				? (element) => element?.getBoundingClientRect().height
				: undefined,
		overscan: 5,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();

	return (
		<tbody
			style={{
				display: "grid",
				height: `${rowVirtualizer.getTotalSize()}px`, //tells scrollbar how big the table is
				position: "relative", //needed for absolute positioning of rows
			}}
		>
			{virtualRows.map((virtualRow) => {
				const row = rows[virtualRow.index] as Row<TableRecord>;

				return (
					<TableBodyRow
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
