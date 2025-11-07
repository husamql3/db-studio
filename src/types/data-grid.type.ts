import type { Cell, RowData, RowSelectionState, SortingState } from "@tanstack/react-table";
import type { RefObject } from "react";

export type RowHeightValue = "short" | "medium" | "tall" | "extra-tall";

export type CellPosition = {
	rowIndex: number;
	columnId: string;
};

export interface CellRange {
	start: CellPosition;
	end: CellPosition;
}

export interface UpdateCell {
	rowIndex: number;
	columnId: string;
	value: unknown;
}

export interface ContextMenuState {
	open: boolean;
	x: number;
	y: number;
}

export interface SelectionState {
	selectedCells: Set<string>;
	selectionRange: CellRange | null;
	isSelecting: boolean;
}

export interface DataGridState {
	sorting: SortingState;
	rowHeight: RowHeightValue;
	rowSelection: RowSelectionState;
	selectionState: SelectionState;
	focusedCell: CellPosition | null;
	editingCell: CellPosition | null;
	contextMenu: ContextMenuState;
	searchQuery: string;
	searchMatches: CellPosition[];
	matchIndex: number;
	searchOpen: boolean;
	lastClickedRowIndex: number | null;
	isScrolling: boolean;
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
	interface ColumnMeta<TData extends RowData, TValue> {
		label?: string;
		cell?: Cell<TData, TValue>;
	}

	interface TableMeta<_TData extends RowData> {
		dataGridRef?: RefObject<HTMLElement | null>;
		focusedCell?: CellPosition | null;
		editingCell?: CellPosition | null;
		selectionState?: SelectionState;
		searchOpen?: boolean;
		isScrolling?: boolean;
		getIsCellSelected?: (rowIndex: number, columnId: string) => boolean;
		getIsSearchMatch?: (rowIndex: number, columnId: string) => boolean;
		getIsActiveSearchMatch?: (rowIndex: number, columnId: string) => boolean;
		onDataUpdate?: (props: UpdateCell | Array<UpdateCell>) => void;
		onRowsDelete?: (rowIndices: number[]) => void | Promise<void>;
		onColumnClick?: (columnId: string) => void;
		onCellClick?: (rowIndex: number, columnId: string, event?: MouseEvent) => void;
		onCellDoubleClick?: (rowIndex: number, columnId: string) => void;
		onCellMouseDown?: (rowIndex: number, columnId: string, event: MouseEvent) => void;
		onCellMouseEnter?: (rowIndex: number, columnId: string, event: MouseEvent) => void;
		onCellMouseUp?: () => void;
		onCellContextMenu?: (rowIndex: number, columnId: string, event: MouseEvent) => void;
		onCellEditingStart?: (rowIndex: number, columnId: string) => void;
		onCellEditingStop?: (opts?: { direction?: NavigationDirection; moveToNextRow?: boolean }) => void;
		contextMenu?: ContextMenuState;
		onContextMenuOpenChange?: (open: boolean) => void;
		rowHeight?: RowHeightValue;
		onRowHeightChange?: (value: RowHeightValue) => void;
		onRowSelect?: (rowIndex: number, checked: boolean, shiftKey: boolean) => void;
	}
}

export interface SearchState {
	searchMatches: CellPosition[];
	matchIndex: number;
	searchOpen: boolean;
	onSearchOpenChange: (open: boolean) => void;
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	onSearch: (query: string) => void;
	onNavigateToNextMatch: () => void;
	onNavigateToPrevMatch: () => void;
}

export interface CellSelectOption {
	label: string;
	value: string;
}

export type CellType =
	| {
			variant: "short-text";
	  }
	| {
			variant: "long-text";
	  }
	| {
			variant: "number";
			min?: number;
			max?: number;
			step?: number;
	  }
	| {
			variant: "select";
			options: CellSelectOption[];
	  }
	| {
			variant: "multi-select";
			options: CellSelectOption[];
	  }
	| {
			variant: "checkbox";
	  }
	| {
			variant: "date";
	  };
