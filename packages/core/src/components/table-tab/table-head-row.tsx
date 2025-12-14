import {
	IconArrowDown,
	IconArrowsUpDown,
	IconArrowUp,
	IconChevronDown,
	IconChevronUp,
	IconTrash,
} from "@tabler/icons-react";
import {
	flexRender,
	type Header,
	type HeaderGroup,
	type Table,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useQueryState } from "nuqs";
import { useCallback } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SortDirection, TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { Button } from "../ui/button";

interface TableHeadRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	headerGroup: HeaderGroup<TableRecord>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	table: Table<TableRecord>;
	header: Header<TableRecord, unknown>;
}

export const TableHeadRow = ({
	columnVirtualizer,
	headerGroup,
	virtualPaddingLeft,
	virtualPaddingRight,
	table,
	header,
}: TableHeadRowProps) => {
	const [, setColumnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [, setSort] = useQueryState(CONSTANTS.SORT);
	const [, setOrder] = useQueryState(CONSTANTS.ORDER);

	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

	const column = header.column;

	// todo: fix this
	const onSortChange = useCallback(
		(direction: SortDirection | null) => {
			if (direction === null) {
				table.setSorting((old) => old.filter((col) => col.id !== column.id));
				setColumnName(null);
				setSort(null);
				setOrder(null);

				return () => {
					setColumnName(null);
					setSort(null);
					setOrder(null);
				};
			}

			table.setSorting((old) =>
				old.map((col) =>
					col.id === column.id
						? { id: col.id, desc: direction === "desc" }
						: col.id !== column.id
							? col
							: old[0],
				),
			);
			setColumnName(column.id);
			setSort(column.id);
			setOrder(direction === "desc" ? "desc" : "asc");

			return () => {
				setColumnName(null);
				setSort(null);
				setOrder(null);
			};
		},
		[table, column, setColumnName, setSort, setOrder],
	);

	return (
		<tr
			key={headerGroup.id}
			className={cn(
				"flex w-full border-b items-center justify-between text-sm hover:bg-accent/40 data-[state=open]:bg-accent/40 [&_svg]:size-4",
				isAnyColumnResizing && "pointer-events-none",
			)}
		>
			{virtualPaddingLeft ? (
				//fake empty column to the left for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((virtualColumn) => {
				const header = headerGroup.headers[virtualColumn.index];
				return (
					<th
						key={header.id}
						className="h-full flex"
						style={{
							display: "flex",
							width: virtualColumn.index === 0 ? "40px" : header.getSize(),
						}}
					>
						<div
							{...{
								className: cn(
									"w-full h-full flex items-center justify-between gap-2text-sm hover:bg-accent/40 data-[state=open]:bg-accent/40 [&_svg]:size-4",
									"border-r border-zinc-800",
									virtualColumn.index === virtualColumns.length - 1 ? "border-r-0" : "",
									header.column.getCanSort() ? "cursor-pointer select-none" : "",
								),
								// onClick: header.column.getToggleSortingHandler(),
							}}
						>
							{virtualColumn.index === 0 ? (
								flexRender(header.column.columnDef.header, header.getContext())
							) : (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											className="p-2 border-none justify-start w-full h-full bg-transparent! rounded-none"
										>
											{flexRender(header.column.columnDef.header, header.getContext())}
											<span className="text-xs leading-none ml-auto">
												{{
													asc: <IconChevronDown />,
													desc: <IconChevronUp />,
												}[header.column.getIsSorted() as "asc" | "desc"] ?? null}
											</span>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										className="w-56"
										align="start"
									>
										<DropdownMenuGroup>
											<DropdownMenuItem onClick={() => onSortChange("asc")}>
												<IconArrowUp />
												Sort ascending
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => onSortChange("desc")}>
												<IconArrowDown />
												Sort descending
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => onSortChange(null)}>
												<IconArrowsUpDown />
												Remove sort
											</DropdownMenuItem>
										</DropdownMenuGroup>
										<DropdownMenuSeparator />
										<DropdownMenuItem>
											<IconTrash className="text-red-500" />
											Delete column
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
								// <div className="flex items-center justify-between w-full">
								// 	<span className="text-sm leading-none">
								// 		{flexRender(header.column.columnDef.header, header.getContext())}
								// 	</span>
								// 	<span className="text-xs leading-none">
								// 		{{
								// 			asc: " 🔼",
								// 			desc: " 🔽",
								// 		}[header.column.getIsSorted() as string] ?? null}
								// 	</span>
								// </div>
							)}
						</div>
					</th>
				);
			})}
			{virtualPaddingRight ? (
				//fake empty column to the right for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingRight }} />
			) : null}
		</tr>
	);
};
