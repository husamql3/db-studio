import { flexRender, type Header } from "@tanstack/react-table";

interface TableHeadCellProps {
	header: Header<Record<string, unknown>, unknown>;
}

export const TableHeadCell = ({ header }: TableHeadCellProps) => {
	return (
		<th
			key={header.id}
			style={{
				display: "flex",
				width: header.getSize(),
			}}
		>
			<div
				{...{
					className: header.column.getCanSort() ? "cursor-pointer select-none" : "",
					onClick: header.column.getToggleSortingHandler(),
				}}
			>
				{flexRender(header.column.columnDef.header, header.getContext())}
				{{
					asc: " 🔼",
					desc: " 🔽",
				}[header.column.getIsSorted() as string] ?? null}
			</div>
		</th>
	);
};
