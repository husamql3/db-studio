import type { Table } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useRef } from "react";
import { DataGridBody } from "@/components/data-grid/data-grid-body";
import { DataGridHead } from "@/components/data-grid/data-grid-head";

export const DataGridContainer = <TRow,>({ table }: { table: Table<TRow> }) => {
	const visibleColumns = table.getVisibleLeafColumns();
	const tableContainerRef = useRef<HTMLDivElement | null>(null);

	const columnVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableCellElement>({
		count: visibleColumns.length,
		estimateSize: (index) => visibleColumns[index].getSize(),
		getScrollElement: () => tableContainerRef.current,
		horizontal: true,
		overscan: 3,
	});

	const virtualColumns = columnVirtualizer.getVirtualItems();

	let virtualPaddingLeft: number | undefined;
	let virtualPaddingRight: number | undefined;

	if (columnVirtualizer && virtualColumns?.length) {
		virtualPaddingLeft = virtualColumns[0]?.start ?? 0;
		virtualPaddingRight =
			columnVirtualizer.getTotalSize() - (virtualColumns[virtualColumns.length - 1]?.end ?? 0);
	}

	return (
		<div
			className="w-full flex-1 overflow-auto"
			ref={tableContainerRef}
			style={{ position: "relative" }}
		>
			<table style={{ display: "grid" }}>
				<DataGridHead
					columnVirtualizer={columnVirtualizer}
					table={table}
					virtualPaddingLeft={virtualPaddingLeft}
					virtualPaddingRight={virtualPaddingRight}
				/>
				<DataGridBody
					columnVirtualizer={columnVirtualizer}
					table={table}
					tableContainerRef={tableContainerRef as RefObject<HTMLDivElement>}
					virtualPaddingLeft={virtualPaddingLeft}
					virtualPaddingRight={virtualPaddingRight}
				/>
			</table>
		</div>
	);
};
