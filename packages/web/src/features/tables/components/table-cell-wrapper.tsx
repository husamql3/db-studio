import { cn } from "@db-studio/ui/utils";
import type { Cell, Table } from "@tanstack/react-table";
import {
	type ComponentProps,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
} from "react";
import type { NavigationDirection, TableRecord } from "@/features/tables/table.type";
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
	/**
	 * Whether the cell's editor popover is open. Given, Escape and Tab end an edit whose editor
	 * has not opened yet.
	 */
	editorOpen?: boolean;
}

export function TableCellWrapper<TData>({
	table,
	cell,
	rowIndex,
	columnId,
	isEditing,
	isFocused,
	isSelected,
	editorOpen,
	ref,
	className,
	onClick: onClickProp,
	onKeyDown: onKeyDownProp,
	...props
}: TableCellWrapperProps<TData>) {
	const { getUpdate } = useUpdateCellStore();

	const meta = table.options.meta;

	const elementRef = useRef<HTMLDivElement | null>(null);

	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			elementRef.current = node;

			if (typeof ref === "function") ref(node);
			else if (ref) ref.current = node;
		},
		[ref],
	);

	useEffect(() => {
		if (isFocused && !isEditing) elementRef.current?.focus();
	}, [isFocused, isEditing]);

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
			// The editor keeps the browser's menu for cut, copy and paste.
			if (isEditing) event.stopPropagation();
		},
		[isEditing],
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
			if (isEditing && editorOpen === false) {
				if (event.key === "Escape") {
					event.preventDefault();
					meta?.onCellEditingStop?.();
				} else if (event.key === "Tab") {
					event.preventDefault();
					meta?.onCellEditingStop?.({ direction: event.shiftKey ? "left" : "right" });
				}
			}

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
		[onKeyDownProp, isFocused, isEditing, editorOpen, meta, rowIndex, columnId],
	);

	const { highlightedCellKeys } = useLiveModeStore();
	const isCellHighlighted = highlightedCellKeys.has(`${cell.row.id}:${columnId}`);

	return (
		<div
			ref={setRef}
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
			onKeyDown={onKeyDown}
			{...props}
		/>
	);
}
