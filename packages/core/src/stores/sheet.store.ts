import { create } from "zustand";

export type SheetName =
	| "add-table"
	| "add-row"
	| `add-foreign-key-${number}`
	| "record-reference";

type SheetState = {
	openSheets: SheetName[];
	recordReferenceData: {
		tableName: string | null;
		columnName: string | null;
		referencedColumn: string | null;
	};
	openSheet: (sheetName: SheetName) => void;
	closeSheet: (sheetName?: SheetName) => void;
	closeAllSheets: () => void;
	toggleSheet: (sheetName: SheetName) => void;
	isSheetOpen: (sheetName: SheetName) => boolean;
	getSheetIndex: (sheetName: SheetName) => number;
	setRecordReference: (
		tableName: string,
		columnName: string,
		referencedColumn: string,
	) => void;
};

export const useSheetStore = create<SheetState>()((set, get) => ({
	openSheets: [],
	recordReferenceData: {
		tableName: null,
		columnName: null,
		referencedColumn: null,
	},

	openSheet: (sheetName: SheetName) =>
		set((state) => {
			// If sheet is already open, bring it to front
			if (state.openSheets.includes(sheetName)) {
				return {
					openSheets: [...state.openSheets.filter((s) => s !== sheetName), sheetName],
				};
			}
			// Otherwise add it to the stack
			return { openSheets: [...state.openSheets, sheetName] };
		}),

	closeSheet: (sheetName?: SheetName) =>
		set((state) => {
			// If no sheet name provided, close the top sheet
			if (!sheetName) {
				return { openSheets: state.openSheets.slice(0, -1) };
			}
			// Otherwise close the specific sheet
			return {
				openSheets: state.openSheets.filter((s) => s !== sheetName),
			};
		}),

	closeAllSheets: () => set({ openSheets: [] }),

	toggleSheet: (sheetName: SheetName) =>
		set((state) => {
			if (state.openSheets.includes(sheetName)) {
				return {
					openSheets: state.openSheets.filter((s) => s !== sheetName),
				};
			}
			console.log("openSheets", state.openSheets, sheetName);
			return { openSheets: [...state.openSheets, sheetName] };
		}),

	isSheetOpen: (sheetName: SheetName) => get().openSheets.includes(sheetName),

	getSheetIndex: (sheetName: SheetName) => get().openSheets.indexOf(sheetName),

	setRecordReference: (tableName: string, columnName: string, referencedColumn: string) =>
		set({ recordReferenceData: { tableName, columnName, referencedColumn } }),
}));
