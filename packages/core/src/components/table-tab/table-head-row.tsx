import type { HeaderGroup } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { TableHeadCell } from "@/components/table-tab/table-head-cell";

interface TableHeadRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	headerGroup: HeaderGroup<Record<string, unknown>>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const TableHeadRow = ({
	columnVirtualizer,
	headerGroup,
	virtualPaddingLeft,
	virtualPaddingRight,
}: TableHeadRowProps) => {
	const virtualColumns = columnVirtualizer.getVirtualItems();

	return (
		<tr
			key={headerGroup.id}
			style={{ display: "flex", width: "100%" }}
		>
			{virtualPaddingLeft ? (
				//fake empty column to the left for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((virtualColumn) => {
				const header = headerGroup.headers[virtualColumn.index];
				return (
					<TableHeadCell
						key={header.id}
						header={header}
					/>
				);
			})}
			{virtualPaddingRight ? (
				//fake empty column to the right for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingRight }} />
			) : null}
		</tr>
	);
};
