import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { TableHeadRow } from "@/components/table-tab/table-head-row";

interface TableHeadProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<Record<string, unknown>>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
}

export const TableHead = ({
	columnVirtualizer,
	table,
	virtualPaddingLeft,
	virtualPaddingRight,
}: TableHeadProps) => {
	return (
		<thead
			style={{
				display: "grid",
				position: "sticky",
				top: 0,
				zIndex: 1,
			}}
		>
			{table.getHeaderGroups().map((headerGroup) => (
				<TableHeadRow
					columnVirtualizer={columnVirtualizer}
					headerGroup={headerGroup}
					key={headerGroup.id}
					virtualPaddingLeft={virtualPaddingLeft}
					virtualPaddingRight={virtualPaddingRight}
				/>
			))}
		</thead>
	);
};
