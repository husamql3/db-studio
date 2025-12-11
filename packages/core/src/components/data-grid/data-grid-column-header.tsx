"use client";

import type {
	ColumnSort,
	Header,
	SortDirection,
	SortingState,
	Table,
} from "@tanstack/react-table";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	EyeOffIcon,
	KeyIcon,
	PinIcon,
	PinOffIcon,
	XIcon,
} from "lucide-react";
import { type ComponentProps, memo, type PointerEvent, useCallback } from "react";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveTableStore } from "@/stores/active-table.store";
import { cn } from "@/utils/cn";

interface DataGridColumnHeaderProps<TData, TValue>
	extends ComponentProps<typeof DropdownMenuTrigger> {
	header: Header<TData, TValue>;
	table: Table<TData>;
}

export function DataGridColumnHeader<TData, TValue>({
	header,
	table,
	className,
	onPointerDown,
	...props
}: DataGridColumnHeaderProps<TData, TValue>) {
	const { setSorting } = useActiveTableStore();

	const column = header.column;
	const label = column.columnDef.meta?.label
		? column.columnDef.meta.label
		: typeof column.columnDef.header === "string"
			? column.columnDef.header
			: column.id;

	const isAnyColumnResizing = table.getState().columnSizingInfo.isResizingColumn;
	const dataTypeLabel = column.columnDef.meta?.dataTypeLabel;
	const isPrimaryKey = column.columnDef.meta?.isPrimaryKey;
	// todo: add isForeignKey to the column meta type
	// const isForeignKey = column.columnDef.meta?.isForeignKey;

	const pinnedPosition = column.getIsPinned();
	const isPinnedLeft = pinnedPosition === "left";
	const isPinnedRight = pinnedPosition === "right";

	const onSortingChange = useCallback(
		(direction: SortDirection) => {
			// Update the store (triggers refetch)
			setSorting(column.id, direction === "desc" ? "desc" : "asc");

			// Update table state for UI
			table.setSorting((prev: SortingState) => {
				const existingSortIndex = prev.findIndex((sort) => sort.id === column.id);
				const newSort: ColumnSort = {
					id: column.id,
					desc: direction === "desc",
				};

				if (existingSortIndex >= 0) {
					const updated = [...prev];
					updated[existingSortIndex] = newSort;
					return updated;
				} else {
					return [...prev, newSort];
				}
			});
		},
		[column.id, table, setSorting],
	);

	const onSortRemove = useCallback(() => {
		// Clear sorting in store
		setSorting(null, "asc");

		// Clear table state
		table.setSorting((prev: SortingState) =>
			prev.filter((sort) => sort.id !== column.id),
		);
	}, [column.id, table, setSorting]);

	const onLeftPin = useCallback(() => {
		column.pin("left");
	}, [column]);

	const onRightPin = useCallback(() => {
		column.pin("right");
	}, [column]);

	const onUnpin = useCallback(() => {
		column.pin(false);
	}, [column]);

	const onTriggerPointerDown = useCallback(
		(event: PointerEvent<HTMLButtonElement>) => {
			onPointerDown?.(event);
			if (event.defaultPrevented) return;

			if (event.button !== 0) {
				return;
			}
			table.options.meta?.onColumnClick?.(column.id);
		},
		[table.options.meta, column.id, onPointerDown],
	);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					className={cn(
						"flex size-full items-center justify-between gap-2 p-2 text-sm hover:bg-accent/40 data-[state=open]:bg-accent/40 [&_svg]:size-4",
						isAnyColumnResizing && "pointer-events-none",
						className,
					)}
					onPointerDown={onTriggerPointerDown}
					{...props}
				>
					<div className="flex min-w-0 flex-1 items-center justify-between gap-1 overflow-hidden">
						<div className="flex items-center gap-1">
							{/* {isForeignKey && (
								<LinkIcon className="size-3	shrink-0 text-muted-foreground" />
							)} */}
							{isPrimaryKey && <KeyIcon className="size-3 shrink-0 text-primary" />}
							<span className="truncate">{label}</span>
						</div>
						<span className="text-muted-foreground text-xs">{dataTypeLabel}</span>
					</div>
					<ChevronDownIcon className="shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={0}
					className="w-60"
				>
					{column.getCanSort() && (
						<>
							<DropdownMenuCheckboxItem
								className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
								checked={column.getIsSorted() === "asc"}
								onClick={() => onSortingChange("asc")}
							>
								<ChevronUpIcon />
								Sort asc
							</DropdownMenuCheckboxItem>
							<DropdownMenuCheckboxItem
								className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
								checked={column.getIsSorted() === "desc"}
								onClick={() => onSortingChange("desc")}
							>
								<ChevronDownIcon />
								Sort desc
							</DropdownMenuCheckboxItem>
							{column.getIsSorted() && (
								<DropdownMenuItem onClick={onSortRemove}>
									<XIcon />
									Remove sort
								</DropdownMenuItem>
							)}
						</>
					)}
					{column.getCanPin() && (
						<>
							{column.getCanSort() && <DropdownMenuSeparator />}

							{isPinnedLeft ? (
								<DropdownMenuItem
									className="[&_svg]:text-muted-foreground"
									onClick={onUnpin}
								>
									<PinOffIcon />
									Unpin from left
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									className="[&_svg]:text-muted-foreground"
									onClick={onLeftPin}
								>
									<PinIcon />
									Pin to left
								</DropdownMenuItem>
							)}
							{isPinnedRight ? (
								<DropdownMenuItem
									className="[&_svg]:text-muted-foreground"
									onClick={onUnpin}
								>
									<PinOffIcon />
									Unpin from right
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									className="[&_svg]:text-muted-foreground"
									onClick={onRightPin}
								>
									<PinIcon />
									Pin to right
								</DropdownMenuItem>
							)}
						</>
					)}
					{column.getCanHide() && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuCheckboxItem
								className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
								checked={!column.getIsVisible()}
								onClick={() => column.toggleVisibility(false)}
							>
								<EyeOffIcon />
								Hide column
							</DropdownMenuCheckboxItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{header.column.getCanResize() && (
				<DataGridColumnResizer
					header={header}
					table={table}
					label={label}
				/>
			)}
		</>
	);
}

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

interface DataGridColumnResizerProps<TData, TValue>
	extends DataGridColumnHeaderProps<TData, TValue> {
	label: string;
}

function DataGridColumnResizerImpl<TData, TValue>({
	header,
	table,
	label,
}: DataGridColumnResizerProps<TData, TValue>) {
	const defaultColumnDef = table._getDefaultColumnDef();

	const onDoubleClick = useCallback(() => {
		header.column.resetSize();
	}, [header.column]);

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
