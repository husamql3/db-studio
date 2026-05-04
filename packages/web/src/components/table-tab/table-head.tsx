import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { TableHeadRow } from "@/components/table-tab/table-head-row";
import type { TableRecord } from "@/types/table.type";

interface TableHeadProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	table: Table<TableRecord>;
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
		<thead className="h-9 grid sticky top-0 z-10">
			{table.getHeaderGroups().map((headerGroup) => (
				<TableHeadRow
					columnVirtualizer={columnVirtualizer}
					headerGroup={headerGroup}
					table={table}
					key={headerGroup.id}
					virtualPaddingLeft={virtualPaddingLeft}
					virtualPaddingRight={virtualPaddingRight}
				/>
			))}
		</thead>
	);
};
