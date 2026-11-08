import type { Row, Table } from "@tanstack/react-table";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useState } from "react";
import type { TableRecord } from "@/types/table.type";
import { TableBodyRow } from "./table-body-row";
import { TableRowMenu } from "./table-row-menu";

const ROW_HEIGHT = 33;

interface TableBodyProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<TableRecord>;
	tableName: string;
	tableContainerRef: RefObject<HTMLDivElement | null>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const TableBody = ({
	columnVirtualizer,
	table,
	tableName,
	tableContainerRef,
	virtualPaddingLeft,
	virtualPaddingRight,
}: TableBodyProps) => {
	const { rows } = table.getRowModel();

	// Every row is one h-8 line plus a 1px border, so rows are never measured: measuring each
	// mounted row forced a synchronous layout per row on every render and scroll.
	const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => ROW_HEIGHT,
		getScrollElement: () => tableContainerRef.current,
		overscan: 5,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();
	const virtualColumns = columnVirtualizer.getVirtualItems();
	const [menuRowIndex, setMenuRowIndex] = useState<number>();

	return (
		<TableRowMenu
			table={table}
			tableName={tableName}
			row={menuRowIndex === undefined ? undefined : rows[menuRowIndex]?.original}
			onOpenChange={(open) => {
				if (!open) setMenuRowIndex(undefined);
			}}
		>
			<tbody
				onContextMenu={(event) => {
					const index = (event.target as HTMLElement).closest("tr")?.dataset.index;
					setMenuRowIndex(index === undefined ? undefined : Number(index));
				}}
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
							key={row.id}
							row={row}
							tableState={table.getState()}
							tableMeta={table.options.meta}
							virtualColumns={virtualColumns}
							virtualPaddingLeft={virtualPaddingLeft}
							virtualPaddingRight={virtualPaddingRight}
							virtualRow={virtualRow}
							isMenuOpen={virtualRow.index === menuRowIndex}
						/>
					);
				})}
			</tbody>
		</TableRowMenu>
	);
};
