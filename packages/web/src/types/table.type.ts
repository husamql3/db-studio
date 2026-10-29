import type { DataTypes, StandardizedDataType } from "@db-studio/shared/types";
import type { RowData } from "@tanstack/react-table";

export type TableRecord = Record<string, unknown>;

export type CellVariant = DataTypes;

/** The table a draft cell edit belongs to, and the columns that tell its rows apart. */
export type EditScope = {
	id: string;
	keyColumns: string[];
};

interface CellPosition {
	rowIndex: number;
	columnId: string;
}

/** A rectangle of cells between the cell a selection started at and the one it reaches. */
export type CellRange = { anchor: CellPosition; focus: CellPosition };

interface UpdateCell {
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
	interface ColumnMeta<TData extends RowData, TValue> {
		label?: string;
		variant?: CellVariant; // Generic type for cell rendering (text/boolean/number/enum/json/date)
		dataTypeLabel?: StandardizedDataType; // Exact database type (int/varchar/timestamp/etc.)
		isPrimaryKey?: boolean;
		isForeignKey?: boolean;
		referencedTable?: string | null;
		referencedColumn?: string | null;
		enumValues?: string[] | null;
		isNullable?: boolean;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface TableMeta<TData extends RowData> {
		editScope?: EditScope;
		canMutateRows?: boolean;
		rowMutationReason?: string;
		focusedCell?: CellPosition | null;
		editingCell?: CellPosition | null;
		selection?: CellRange | null;
		isScrolling?: boolean;

		onCellEditingStart?: (rowIndex: number, columnId: string) => void;
		/** Moves focus from the cell; false when it is already at the grid's edge. */
		onCellNavigate?: (
			rowIndex: number,
			columnId: string,
			direction: NavigationDirection,
		) => boolean;
		onRowDetailsOpen?: (rowIndex: number) => void;
		onCellClick?: (rowIndex: number, columnId: string, event?: React.MouseEvent) => void;

		getIsCellSelected?: (rowIndex: number, columnId: string) => boolean;
		onCellMouseUp?: () => void;
		onDataUpdate?: (props: UpdateCell | Array<UpdateCell>) => void;

		onCellDoubleClick?: (rowIndex: number, columnId: string) => void;
		onCellContextMenu?: (rowIndex: number, columnId: string, event: React.MouseEvent) => void;
		onCellMouseDown?: (rowIndex: number, columnId: string, event: React.MouseEvent) => void;
		onCellMouseEnter?: (rowIndex: number, columnId: string, event: React.MouseEvent) => void;
		onCellEditingStop?: (opts?: {
			direction?: NavigationDirection;
			moveToNextRow?: boolean;
		}) => void;
		isRowHighlighted?: (rowId: string) => boolean;
		isCellHighlighted?: (rowId: string, columnId: string) => boolean;
	}
}
