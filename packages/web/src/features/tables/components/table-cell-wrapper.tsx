import { cn } from "@db-studio/ui/utils";
import type { Cell, Table } from "@tanstack/react-table";
import { type ComponentProps, type KeyboardEvent, type MouseEvent, useCallback } from "react";
import type { NavigationDirection, TableRecord } from "@/types/table.type";
import { useLiveModeStore } from "../stores/live-mode.store";
import { useUpdateCellStore } from "../stores/update-cell.store";

const NAVIGATION_KEYS: Partial<Record<string, NavigationDirection>> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
	Home: "home",
	End: "end",
	Tab: "right",
};

interface TableCellWrapperProps<TData> extends ComponentProps<"div"> {
	cell: Cell<TData, unknown>;
	table: Table<TableRecord>;
	rowIndex: number;
	columnId: string;
	isEditing: boolean;
	isFocused: boolean;
	isSelected: boolean;
}

export function TableCellWrapper<TData>({
	table,
	cell,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
	className,
	onClick: onClickProp,
	onKeyDown: onKeyDownProp,
	...props
}: TableCellWrapperProps<TData>) {
	const { getUpdate } = useUpdateCellStore();

	const meta = table.options.meta;

	// Check if this cell has a pending update
	const rowData = cell.row.original as Record<string, unknown>;
	const hasUpdate = !!getUpdate(rowData, columnId, table.options.meta?.editScope);

	const onClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!isEditing) {
				event.preventDefault();
				onClickProp?.(event);
				// A single click only focuses the cell; editing starts on double-click or
				// via the keyboard, and row details open from the row button or Space.
				meta?.onCellClick?.(rowIndex, columnId, event);
			}
		},
		[meta, rowIndex, columnId, isEditing, onClickProp],
	);

	const onContextMenu = useCallback(
		(event: MouseEvent) => {
			if (!isEditing) {
				meta?.onCellContextMenu?.(rowIndex, columnId, event);
			}
		},
		[meta, rowIndex, columnId, isEditing],
	);

	const onMouseDown = useCallback(
		(event: MouseEvent) => {
			if (!isEditing) {
				meta?.onCellMouseDown?.(rowIndex, columnId, event);
			}
		},
		[meta, rowIndex, columnId, isEditing],
	);

	const onMouseEnter = useCallback(
		(event: MouseEvent) => {
			if (!isEditing) {
				meta?.onCellMouseEnter?.(rowIndex, columnId, event);
			}
		},
		[meta, rowIndex, columnId, isEditing],
	);

	const onMouseUp = useCallback(() => {
		if (!isEditing) {
			meta?.onCellMouseUp?.();
		}
	}, [meta, isEditing]);

	const onDoubleClick = useCallback(
		(event: MouseEvent) => {
			if (!isEditing) {
				event.preventDefault();
				meta?.onCellDoubleClick?.(rowIndex, columnId);
			}
		},
		[meta, rowIndex, columnId, isEditing],
	);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			onKeyDownProp?.(event);

			if (event.defaultPrevented) return;

			if (!isFocused || isEditing) return;

			const direction = NAVIGATION_KEYS[event.key];
			if (direction) {
				const resolved = event.key === "Tab" && event.shiftKey ? "left" : direction;
				const moved = meta?.onCellNavigate?.(rowIndex, columnId, resolved) ?? false;
				// Tab at the grid's edge falls through so focus can leave the grid.
				if (moved || event.key !== "Tab") event.preventDefault();
				return;
			}

			if (event.key === "F2" || event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				meta?.onCellEditingStart?.(rowIndex, columnId);
				return;
			}

			if (event.key === " ") {
				event.preventDefault();
				event.stopPropagation();
				meta?.onRowDetailsOpen?.(rowIndex);
				return;
			}

			if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
				event.preventDefault();
				event.stopPropagation();
				meta?.onCellEditingStart?.(rowIndex, columnId);
			}
		},
		[onKeyDownProp, isFocused, isEditing, meta, rowIndex, columnId],
	);
	const { highlightedCellKeys } = useLiveModeStore();
	const isCellHighlighted = highlightedCellKeys.has(`${cell.row.id}:${columnId}`);

	return (
		<div
			role="button"
			data-slot="grid-cell-wrapper"
			data-editing={isEditing ? "" : undefined}
			data-focused={isFocused ? "" : undefined}
			data-selected={isSelected ? "" : undefined}
			data-has-update={hasUpdate ? "" : undefined}
			tabIndex={isFocused && !isEditing ? 0 : -1}
			className={cn(
				"size-full px-2 py-1.5 text-left text-sm outline-none has-data-[slot=checkbox]:pt-2.5",
				"**:data-[slot=grid-cell-content]:line-clamp-1",
				{
					"ring-1 ring-ring ring-inset": isFocused,
					"bg-primary/25": isSelected && !isEditing,
					"cursor-default": !isEditing,
					"ring-2 ring-primary": hasUpdate,
					"bg-emerald-500/20 dark:bg-emerald-500/25 transition-colors duration-1000 ease-in-out":
						isCellHighlighted,
				},
				className,
			)}
			onClick={onClick}
			onContextMenu={onContextMenu}
			onDoubleClick={onDoubleClick}
			onMouseDown={onMouseDown}
			onMouseEnter={onMouseEnter}
			onMouseUp={onMouseUp}
			onKeyDown={onKeyDown}
			{...props}
		/>
	);
}
