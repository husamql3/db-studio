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
	type HeaderGroup,
	type SortDirection,
	type Table,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { Key, Link } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { TableColumnResizer } from "@/components/table-tab/table-col-resizer";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useDeleteColumn } from "@/hooks/use-delete-column";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/_pathlessLayout/table/$table";
import type { TableRecord } from "@/types/table.type";
import { CONSTANTS } from "@/utils/constants";

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
	const { table: activeTableName } = Route.useParams();
	console.log("activeTableName in TableHeadRow", activeTableName);

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [columnToDelete, setColumnToDelete] = useState<string | null>(null);
	const [cascadeDelete, setCascadeDelete] = useState(false);
	const { deleteColumn } = useDeleteColumn();

	const [, setColumnName] = useQueryState(CONSTANTS.COLUMN_NAME);
	const [, setSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [, setOrder] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

	const virtualColumns = columnVirtualizer.getVirtualItems();
	const isAnyColumnResizing =
		table.getState().columnSizingInfo.isResizingColumn;

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

	const handleDeleteClick = useCallback((columnId: string) => {
		setColumnToDelete(columnId);
		setDeleteDialogOpen(true);
	}, []);

	const handleConfirmDelete = useCallback(async () => {
		if (!columnToDelete || !activeTableName) return;

		await deleteColumn({
			tableName: activeTableName,
			columnName: columnToDelete,
			cascade: cascadeDelete,
		});

		setDeleteDialogOpen(false);
		setColumnToDelete(null);
		setCascadeDelete(false);
	}, [columnToDelete, activeTableName, deleteColumn, cascadeDelete]);

	const handleCancelDelete = useCallback(() => {
		setDeleteDialogOpen(false);
		setColumnToDelete(null);
		setCascadeDelete(false);
	}, []);

	return (
		<>
			<tr
				key={headerGroup.id}
				className={cn(
					"flex w-fit bg-black border-b items-center justify-between text-sm data-[state=open]:bg-accent/40 [&_svg]:size-4",
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
										header.column.getCanSort()
											? "cursor-pointer select-none"
											: "",
									),
									// onClick: header.column.getToggleSortingHandler(),
								}}
							>
								{virtualColumn.index === 0 ? (
									flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)
								) : (
									<>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													className="p-2 border-none w-full h-full bg-transparent! rounded-none justify-between"
												>
													{/* TODO: add a tooltip for the icon */}
													<div className="flex items-center gap-1">
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
														{flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
													</div>

													<div className="flex items-center gap-1">
														{dataTypeLabel && (
															<span className="text-xs leading-none text-muted-foreground">
																{dataTypeLabel}
															</span>
														)}

														<span className="text-xs leading-none text-muted-foreground">
															{{
																asc: <IconChevronDown />,
																desc: <IconChevronUp />,
															}[
																header.column.getIsSorted() as "asc" | "desc"
															] ?? null}
														</span>
													</div>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												className="w-44"
												align="start"
											>
												<DropdownMenuGroup>
													<DropdownMenuItem
														onClick={() =>
															createSortHandler(header.column.id)("asc")
														}
													>
														<IconArrowUp />
														Sort ascending
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															createSortHandler(header.column.id)("desc")
														}
													>
														<IconArrowDown />
														Sort descending
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															createSortHandler(header.column.id)(null)
														}
													>
														<IconX />
														Remove sort
													</DropdownMenuItem>
												</DropdownMenuGroup>
												<DropdownMenuSeparator />

												{/* Delete column button */}
												<DropdownMenuItem
													variant="destructive"
													onClick={() => handleDeleteClick(header.column.id)}
												>
													<IconTrash />
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

			<AlertDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Column</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete the column "{columnToDelete}
							"? This action cannot be undone and will permanently remove all
							data in this column.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="flex items-center gap-2 py-2">
						<Checkbox
							id="cascade-delete"
							checked={cascadeDelete}
							onCheckedChange={(checked) => setCascadeDelete(checked === true)}
						/>
						<Label
							htmlFor="cascade-delete"
							className="text-sm text-muted-foreground cursor-pointer"
						>
							Drop with CASCADE (also remove dependent indexes, constraints, and
							foreign key references)
						</Label>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleCancelDelete}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleConfirmDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
