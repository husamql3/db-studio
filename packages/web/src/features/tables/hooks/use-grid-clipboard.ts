import type { Table } from "@tanstack/react-table";
import { type ClipboardEvent, useState } from "react";
import { toast } from "sonner";
import type { TableRecord } from "@/types/table.type";
import { formatCellValue } from "@/utils/format-cell-value";
import { useUpdateCellStore } from "../stores/update-cell.store";
import {
	coercePastedValue,
	parseClipboardText,
	toClipboardText,
} from "../utils/grid-clipboard";

type PastedChange = { rowData: TableRecord; columnId: string; value: unknown };
type PasteProblem = {
	rowNumber: number;
	columnId: string;
	text: string;
	error: string;
};
export type PastePreview = {
	changes: PastedChange[];
	problems: PasteProblem[];
	skipped: number;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Copy of the selected range (with its column names) and paste of spreadsheet cells into
 * existing rows, from the selection's top-left cell or the focused cell. Pasted values only
 * stage edits; a paste with values a column cannot take is previewed first.
 */
export const useGridClipboard = (table: Table<TableRecord>) => {
	const { getUpdate, setUpdate } = useUpdateCellStore();
	const [preview, setPreview] = useState<PastePreview | null>(null);
	const meta = table.options.meta;

	// Only a focused grid cell copies or pastes; editors and dialogs keep the browser's behaviour.
	const getBounds = (event: ClipboardEvent<HTMLElement>) => {
		const range =
			meta?.selection ??
			(meta?.focusedCell && { anchor: meta.focusedCell, focus: meta.focusedCell });
		if (
			!range ||
			meta?.editingCell ||
			!(event.target as HTMLElement).closest('[data-slot="grid-cell-wrapper"]')
		) {
			return null;
		}
		const columns = table.getVisibleLeafColumns().filter((column) => column.id !== "select");
		const index = (columnId: string) => columns.findIndex((column) => column.id === columnId);
		const [a, b] = [index(range.anchor.columnId), index(range.focus.columnId)];
		// The focused column may have been hidden since.
		if (a < 0 || b < 0) return null;
		return {
			columns,
			rows: table.getRowModel().rows,
			top: Math.min(range.anchor.rowIndex, range.focus.rowIndex),
			bottom: Math.max(range.anchor.rowIndex, range.focus.rowIndex),
			left: Math.min(a, b),
			right: Math.max(a, b),
		};
	};

	// What the cell shows: its pending edit, or the stored value.
	const currentValue = (rowData: TableRecord, columnId: string) => {
		const pending = getUpdate(rowData, columnId, meta?.editScope);
		return pending ? pending.newValue : rowData[columnId];
	};

	const stage = (changes: PastedChange[]) => {
		for (const { rowData, columnId, value } of changes) {
			setUpdate(rowData, columnId, value, rowData[columnId], meta?.editScope);
		}
	};

	const onCopy = (event: ClipboardEvent<HTMLElement>) => {
		const bounds = getBounds(event);
		if (!bounds) return;
		const columns = bounds.columns.slice(bounds.left, bounds.right + 1);
		const lines = [
			columns.map((column) => column.id),
			...bounds.rows
				.slice(bounds.top, bounds.bottom + 1)
				.map((row) =>
					columns.map((column) => formatCellValue(currentValue(row.original, column.id))),
				),
		];
		event.clipboardData.setData("text/plain", toClipboardText(lines));
		event.preventDefault();
	};

	const onPaste = (event: ClipboardEvent<HTMLElement>) => {
		const bounds = getBounds(event);
		const text = event.clipboardData.getData("text/plain");
		if (!bounds || !text) return;
		event.preventDefault();
		if (meta?.canMutateRows === false) {
			toast.error(meta.rowMutationReason ?? "This table can't be edited");
			return;
		}

		const columns = bounds.columns.slice(bounds.left);
		let cells = parseClipboardText(text);
		// A range copied from this grid starts with its column names.
		if (cells.length > 1 && cells[0].every((name, i) => name === columns[i]?.id)) {
			cells = cells.slice(1);
		}

		const next: PastePreview = { changes: [], problems: [], skipped: 0 };
		cells.forEach((line, r) => {
			const row = bounds.rows[bounds.top + r];
			line.forEach((cellText, c) => {
				const column = columns[c];
				// Paste fills existing rows only; cells past the last row or column are dropped.
				if (!row || !column) {
					next.skipped++;
					return;
				}
				if (formatCellValue(currentValue(row.original, column.id)) === cellText) return;
				const result = coercePastedValue(cellText, column.columnDef.meta ?? {});
				if ("error" in result) {
					next.problems.push({
						rowNumber: bounds.top + r + 1,
						columnId: column.id,
						text: cellText,
						error: result.error,
					});
				} else {
					next.changes.push({
						rowData: row.original,
						columnId: column.id,
						value: result.value,
					});
				}
			});
		});

		if (next.problems.length > 0) {
			setPreview(next);
			return;
		}
		stage(next.changes);
		const skipped =
			next.skipped > 0 ? `; ${plural(next.skipped, "cell")} outside the grid skipped` : "";
		toast.success(`${plural(next.changes.length, "change")} staged${skipped}`);
	};

	return {
		onCopy,
		onPaste,
		preview,
		stagePreview: () => {
			if (preview) stage(preview.changes);
			setPreview(null);
		},
		closePreview: () => setPreview(null),
	};
};
