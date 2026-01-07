import type { RowData } from "@tanstack/react-table";
import type { DataTypes, StandardizedDataType } from "server/src/types/column.types";
export type TableRecord = Record<string, unknown>;

export type CellVariant = DataTypes;

export interface CellPosition {
	rowIndex: number;
	columnId: string;
}

export interface UpdateCell {
	rowIndex: number;
	columnId: string;
	value: unknown;
}

export type NavigationDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "home"
	| "end"
	| "ctrl+home"
	| "ctrl+end"
	| "pageup"
	| "pagedown";

declare module "@tanstack/react-table" {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<_TData extends RowData, _TValue> {
		label?: string;
		variant?: CellVariant; // Generic type for cell rendering (text/boolean/number/enum/json/date)
		dataTypeLabel?: StandardizedDataType; // Exact database type (int/varchar/timestamp/etc.)
		isPrimaryKey?: boolean;
		isForeignKey?: boolean;
		referencedTable?: string | null;
		referencedColumn?: string | null;
		enumValues?: string[] | null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<_TData extends RowData> {
		focusedCell?: CellPosition | null;
		editingCell?: CellPosition | null;
		isScrolling?: boolean;

		onCellEditingStart?: (rowIndex: number, columnId: string) => void;
		onCellClick?: (rowIndex: number, columnId: string, event?: React.MouseEvent) => void;

		getIsCellSelected?: (rowIndex: number, columnId: string) => boolean;
		onCellMouseUp?: () => void;
		onDataUpdate?: (props: UpdateCell | Array<UpdateCell>) => void;

		onCellDoubleClick?: (rowIndex: number, columnId: string) => void;
		onCellContextMenu?: (
			rowIndex: number,
			columnId: string,
			event: React.MouseEvent,
		) => void;
		onCellMouseDown?: (
			rowIndex: number,
			columnId: string,
			event: React.MouseEvent,
		) => void;
		onCellMouseEnter?: (
			rowIndex: number,
			columnId: string,
			event: React.MouseEvent,
		) => void;
		onCellEditingStop?: (opts?: {
			direction?: NavigationDirection;
			moveToNextRow?: boolean;
		}) => void;
	}
}
