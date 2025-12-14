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
		<thead className="h-10 grid sticky top-0 z-10 bg-black">
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
