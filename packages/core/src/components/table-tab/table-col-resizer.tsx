import type { Header, Table } from "@tanstack/react-table";
import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TableRecord } from "@/types/table.type";

export const TableColumnResizer = memo(TableColumnResizerImpl, (prev, next) => {
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
}) as typeof TableColumnResizerImpl;

interface TableColumnResizerProps {
	header: Header<TableRecord, unknown>;
	table: Table<TableRecord>;
	label: string;
}

function TableColumnResizerImpl({ header, table, label }: TableColumnResizerProps) {
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
