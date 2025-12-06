import type { CellPosition, CellVariant } from "@/types/data-grid";
import type { DataType } from "@/types/table-grid.type";

export function getCellKey(rowIndex: number, columnId: string) {
	return `${rowIndex}:${columnId}`;
}

export function parseCellKey(cellKey: string): Required<CellPosition> {
	const parts = cellKey.split(":");
	const rowIndexStr = parts[0];
	const columnId = parts[1];
	if (rowIndexStr && columnId) {
		const rowIndex = parseInt(rowIndexStr, 10);
		if (!Number.isNaN(rowIndex)) {
			return { rowIndex, columnId };
		}
	}
	return { rowIndex: 0, columnId: "" };
}

export const getCellVariant = (dataType: DataType): CellVariant => {
	switch (dataType) {
		case "short-text":
			return { variant: "short-text" };
		case "long-text":
			return { variant: "long-text" };
		case "boolean":
			return { variant: "boolean" };
		case "number":
			return { variant: "number" };
		default:
			return { variant: "long-text" };
	}
};
