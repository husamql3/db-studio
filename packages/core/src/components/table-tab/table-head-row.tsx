import {
	IconArrowDown,
	IconArrowUp,
	IconChevronDown,
	IconChevronUp,
	IconTrash,
	IconX,
} from "@tabler/icons-react";
import {
	flexRender,
	type Header,
	type HeaderGroup,
	type SortDirection,
	type Table,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { Key, Link } from "lucide-react";
import { useQueryState } from "nuqs";
import { memo, useCallback } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";
import { Button } from "../ui/button";

interface TableHeadRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	headerGroup: HeaderGroup<TableRecord>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	table: Table<TableRecord>;
}

export const TableHeadRow = ({
	columnVirtualizer,
	headerGroup,
	virtualPaddingLeft,
	virtualPaddingRight,
	table,
}: TableHeadRowProps) => {
	const [, setColumnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [, setSort] = useQueryState(CONSTANTS.SORT);
	const [, setOrder] = useQueryState(CONSTANTS.ORDER);

	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

	console.log(headerGroup.headers);
	// const isPrimaryKey = headerGroup.headers[0].column.columnDef.meta?.isPrimaryKey;

	const createSortHandler = useCallback(
		(columnId: string) => (direction: SortDirection | null) => {
			if (direction === null) {
				// Clear sorting
				setColumnName(null);
				setSort(null);
				setOrder(null);
			} else {
				// Update query state (table state will be derived from this)
				setColumnName(columnId);
				setSort(columnId);
				setOrder(direction === "desc" ? "desc" : "asc");
			}
		},
		[setColumnName, setSort, setOrder],
	);

	return (
		<tr
			key={headerGroup.id}
			className={cn(
				"flex w-full border-b items-center justify-between text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4",
				isAnyColumnResizing && "pointer-events-none",
			)}
		>
			{virtualPaddingLeft ? (
				//fake empty column to the left for virtualization scroll padding
				<th style={{ display: "flex", width: virtualPaddingLeft }} />
			) : null}
			{virtualColumns.map((virtualColumn) => {
				const header = headerGroup.headers[virtualColumn.index];
				const isPrimaryKey = header.column.columnDef.meta?.isPrimaryKey;
				const isForeignKey = header.column.columnDef.meta?.isForeignKey;

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
									"relative w-full h-full flex items-center justify-between gap-2 text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4",
									"border-r border-zinc-800",
									header.column.getCanSort() ? "cursor-pointer select-none" : "",
								),
								// onClick: header.column.getToggleSortingHandler(),
							}}
						>
							{virtualColumn.index === 0 ? (
								flexRender(header.column.columnDef.header, header.getContext())
							) : (
								<>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="outline"
												className="p-2 border-none w-full h-full bg-transparent! rounded-none"
											>
												{/* TODO: add a tooltip for the icon */}
												{isPrimaryKey && (
													<Key
														size={20}
														className="text-primary"
													/>
												)}
												{isForeignKey && (
													<Link
														size={20}
														className="text-primary"
													/>
												)}

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
											className="w-44"
											align="start"
										>
											<DropdownMenuGroup>
												<DropdownMenuItem
													onClick={() => createSortHandler(header.column.id)("asc")}
												>
													<IconArrowUp />
													Sort ascending
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => createSortHandler(header.column.id)("desc")}
												>
													<IconArrowDown />
													Sort descending
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => createSortHandler(header.column.id)(null)}
												>
													<IconX />
													Remove sort
												</DropdownMenuItem>
											</DropdownMenuGroup>
											<DropdownMenuSeparator />
											<DropdownMenuItem variant="destructive">
												<IconTrash />
												Delete column
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>

									{header.column.getCanResize() && (
										<DataGridColumnResizer
											header={header}
											table={table}
											label={header.column.id}
										/>
									)}
								</>
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
const DataGridColumnResizer = memo(DataGridColumnResizerImpl, (prev, next) => {
	const prevColumn = prev.header.column;
	const nextColumn = next.header.column;

	if (
		prevColumn.getIsResizing() !== nextColumn.getIsResizing() ||
		prevColumn.getSize() !== nextColumn.getSize()
	) {
		return false;
	}

	if (prev.label !== next.label) return false;

	return true;
}) as typeof DataGridColumnResizerImpl;

interface DataGridColumnResizerProps {
	header: Header<TableRecord, unknown>;
	table: Table<TableRecord>;
	label: string;
}

function DataGridColumnResizerImpl({ header, table, label }: DataGridColumnResizerProps) {
	const defaultColumnDef = table._getDefaultColumnDef();

	const onDoubleClick = useCallback(() => {
		table.setColumnSizing((old) => {
			const newSizing = { ...old };
			delete newSizing[header.column.id];
			return newSizing;
		});
	}, [header.column.id, table]);

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={`Resize ${label} column`}
			aria-valuenow={header.column.getSize()}
			aria-valuemin={defaultColumnDef.minSize}
			aria-valuemax={defaultColumnDef.maxSize}
			tabIndex={0}
			className={cn(
				"after:-translate-x-1/2 -right-px absolute top-0 z-50 h-full w-0.5 cursor-ew-resize touch-none select-none bg-border transition-opacity after:absolute after:inset-y-0 after:left-1/2 after:h-full after:w-[18px] after:content-[''] hover:bg-primary focus:bg-primary focus:outline-none",
				header.column.getIsResizing() ? "bg-primary" : "opacity-0 hover:opacity-100",
			)}
			onDoubleClick={onDoubleClick}
			onMouseDown={header.getResizeHandler()}
			onTouchStart={header.getResizeHandler()}
		/>
	);
}
