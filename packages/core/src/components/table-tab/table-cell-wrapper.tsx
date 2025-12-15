import type { Cell, Table } from "@tanstack/react-table";
import {
	type ComponentProps,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
} from "react";
import { cn } from "@/lib/utils";
import type { TableRecord } from "@/types/table.type";

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
	const meta = table.options.meta;

	const onClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!isEditing) {
				event.preventDefault();
				onClickProp?.(event);
				if (isFocused) {
					meta?.onCellEditingStart?.(rowIndex, columnId);
				} else {
					meta?.onCellClick?.(rowIndex, columnId, event);
				}
			}
		},
		[meta, rowIndex, columnId, isEditing, isFocused, onClickProp],
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

			if (
				event.key === "ArrowUp" ||
				event.key === "ArrowDown" ||
				event.key === "ArrowLeft" ||
				event.key === "ArrowRight" ||
				event.key === "Home" ||
				event.key === "End" ||
				event.key === "PageUp" ||
				event.key === "PageDown" ||
				event.key === "Tab"
			) {
				return;
			}

			if (isFocused && !isEditing) {
				if (event.key === "F2" || event.key === "Enter") {
					event.preventDefault();
					event.stopPropagation();
					meta?.onCellEditingStart?.(rowIndex, columnId);
					return;
				}

				if (event.key === " ") {
					event.preventDefault();
					event.stopPropagation();
					meta?.onCellEditingStart?.(rowIndex, columnId);
					return;
				}

				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
					event.preventDefault();
					event.stopPropagation();
					meta?.onCellEditingStart?.(rowIndex, columnId);
				}
			}
		},
		[onKeyDownProp, isFocused, isEditing, meta, rowIndex, columnId],
	);
	return (
		<div
			role="button"
			data-slot="grid-cell-wrapper"
			data-editing={isEditing ? "" : undefined}
			data-focused={isFocused ? "" : undefined}
			data-selected={isSelected ? "" : undefined}
			tabIndex={isFocused && !isEditing ? 0 : -1}
			className={cn(
				"size-full px-2 py-1.5 text-left text-sm outline-none has-data-[slot=checkbox]:pt-2.5",
				"**:data-[slot=grid-cell-content]:line-clamp-1",
				{
					"ring-1 ring-ring ring-inset": isFocused,
					"bg-primary/10": isSelected && !isEditing,
					"cursor-default": !isEditing,
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
