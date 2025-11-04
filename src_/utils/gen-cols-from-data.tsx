import type { ColumnDef } from "@tanstack/react-table";
import { TableCell } from "../components/table-cell";
import type { TableRow } from "../services/get-table";

export const generateColumnsFromData = (
	data: TableRow[],
	onCellChange: (rowId: string, columnKey: string, newValue: unknown) => void,
	getCellValue: (rowId: string, columnKey: string, originalValue: unknown) => unknown,
	isCellChanged: (rowId: string, columnKey: string) => boolean,
): ColumnDef<TableRow>[] => {
	if (!data || data.length === 0) {
		return [];
	}

	const firstRow = data[0];
	const keys = Object.keys(firstRow);

	return keys.map((key) => ({
		accessorKey: key,
		header: key,
		cell: (info) => {
			const rowId = info.row.id;
			const originalValue = info.getValue();
			const currentValue = getCellValue(rowId, key, originalValue);
			const isChanged = isCellChanged(rowId, key);

			// Don't make Date or complex objects editable
			if (originalValue instanceof Date) {
				return originalValue.toLocaleString();
			}

			if (typeof originalValue === "object" && originalValue !== null) {
				return JSON.stringify(originalValue);
			}

			return (
				<TableCell value={currentValue} rowId={rowId} columnKey={key} isChanged={isChanged} onChange={onCellChange} />
			);
		},
	}));
};
