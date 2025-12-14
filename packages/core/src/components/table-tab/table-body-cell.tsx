import { type Cell, flexRender } from "@tanstack/react-table";

interface TableBodyCellProps {
	cell: Cell<Record<string, unknown>, unknown>;
}

export const TableBodyCell = ({ cell }: TableBodyCellProps) => {
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
