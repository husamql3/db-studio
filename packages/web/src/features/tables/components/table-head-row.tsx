import { Button } from "@db-studio/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@db-studio/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@db-studio/ui/tooltip";
import { cn } from "@db-studio/ui/utils";
import {
	flexRender,
	type HeaderGroup,
	type SortDirection,
	type Table,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronUp,
	Key,
	Link,
	Trash2,
	X,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { DropColumnDialog } from "@/features/schema";
import type { TableRecord } from "@/features/tables/table.type";
import { useDatabaseEngine } from "@/hooks/use-database-engine";
import { useTableSchemaName } from "@/hooks/use-table-schema-name";
import { CONSTANTS } from "@/utils/constants";
import { TableColumnResizer } from "./table-col-resizer";

interface TableHeadRowProps {
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>;
	headerGroup: HeaderGroup<TableRecord>;
	virtualPaddingLeft: number | undefined;
	virtualPaddingRight: number | undefined;
	table: Table<TableRecord>;
	tableName: string;
}

export const TableHeadRow = ({
	columnVirtualizer,
	headerGroup,
	virtualPaddingLeft,
	virtualPaddingRight,
	table,
	tableName,
}: TableHeadRowProps) => {
	const engine = useDatabaseEngine();

	const [columnToDelete, setColumnToDelete] = useState<string | null>(null);
	const schemaName = useTableSchemaName();

	const [, setSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [, setOrder] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);
	const [, setCursor] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.CURSOR);
	const [, setDirection] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.DIRECTION);

	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;

	const createSortHandler = useCallback(
		(columnId: string) => (direction: SortDirection | null) => {
			if (direction === null) {
				setSort(null);
				setOrder(null);
			} else {
				// The table's sort state is derived from these query params.
				setSort(columnId);
				setOrder(direction === "desc" ? "desc" : "asc");
			}

			setCursor(null);
			setDirection(null);
		},
		[setSort, setOrder, setCursor, setDirection],
	);

	return (
		<>
			<tr
				key={headerGroup.id}
				className={cn(
					"flex w-fit bg-muted/40 border-b border-border items-center justify-between text-sm data-[state=open]:bg-accent/40 [&_svg]:size-4",
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
					const dataTypeLabel = header.column.columnDef.meta?.dataTypeLabel;

					return (
						<th
							key={header.id}
							className="h-full flex z-100! relative"
							style={{
								display: "flex",
								width: virtualColumn.index === 0 ? "64px" : header.getSize(),
							}}
						>
							<div
								{...{
									className: cn(
										"relative w-full h-full flex items-center justify-between gap-2 text-sm hover:bg-accent/20 data-[state=open]:bg-accent/40 [&_svg]:size-4",
										"border-r border-border",
										header.column.getCanSort() ? "cursor-pointer select-none" : "",
									),
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
													className="relative border-none w-full h-full bg-transparent! rounded-none justify-between"
												>
													<div className="flex items-center gap-1">
														{isPrimaryKey && (
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="inline-flex">
																		<Key
																			size={20}
																			className="text-primary"
																		/>
																	</span>
																</TooltipTrigger>
																<TooltipContent className="text-[10px]">
																	primary key
																</TooltipContent>
															</Tooltip>
														)}
														{isForeignKey && (
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="inline-flex">
																		<Link
																			size={20}
																			className="text-primary"
																		/>
																	</span>
																</TooltipTrigger>
																<TooltipContent className="text-[10px]">
																	foreign key
																</TooltipContent>
															</Tooltip>
														)}
														{flexRender(header.column.columnDef.header, header.getContext())}
													</div>

													<div className="flex items-center gap-1">
														{dataTypeLabel && (
															<span className="text-xs leading-none text-muted-foreground">
																{dataTypeLabel}
															</span>
														)}

														<span className="text-xs leading-none text-muted-foreground">
															{{
																asc: <ChevronDown />,
																desc: <ChevronUp />,
															}[header.column.getIsSorted() as "asc" | "desc"] ?? null}
														</span>
													</div>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												className="w-44"
												align="start"
											>
												{engine?.filterSort !== false && (
													<>
														<DropdownMenuGroup>
															<DropdownMenuItem
																onClick={() => createSortHandler(header.column.id)("asc")}
															>
																<ArrowUp />
																Sort ascending
															</DropdownMenuItem>

															<DropdownMenuItem
																onClick={() => createSortHandler(header.column.id)("desc")}
															>
																<ArrowDown />
																Sort descending
															</DropdownMenuItem>

															{header.column.getIsSorted() && (
																<DropdownMenuItem
																	onClick={() => createSortHandler(header.column.id)(null)}
																>
																	<X />
																	Remove sort
																</DropdownMenuItem>
															)}
														</DropdownMenuGroup>
														<DropdownMenuSeparator />
													</>
												)}
												<DropdownMenuItem
													variant="destructive"
													disabled={engine?.schemaMutation === false}
													onClick={() => setColumnToDelete(header.column.id)}
												>
													<Trash2 />
													Delete column
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>

										{header.column.getCanResize() && (
											<TableColumnResizer
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

			<DropColumnDialog
				tableName={tableName}
				schemaName={schemaName}
				columnName={columnToDelete ?? ""}
				open={columnToDelete !== null}
				onOpenChange={(open) => {
					if (!open) setColumnToDelete(null);
				}}
			/>
		</>
	);
};
