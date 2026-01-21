import { type Cell, flexRender } from "@tanstack/react-table";
import type { TableRecord } from "shared/types";

export const TableBodyCell = ({
	cell,
}: {
	cell: Cell<TableRecord, unknown>;
}) => {
	return (
		<td
			key={cell.id}
			style={{
				display: "flex",
				width: cell.column.getSize(),
			}}
		>
			{flexRender(cell.column.columnDef.cell, cell.getContext())}
		</td>
	);
};
