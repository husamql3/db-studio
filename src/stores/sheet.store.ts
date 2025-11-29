import { create } from "zustand";

export type SheetName = "add-table" | "add-row" | "add-foreign-key";

type SheetState = {
	openSheets: SheetName[];
	openSheet: (sheetName: SheetName) => void;
	closeSheet: (sheetName?: SheetName) => void;
	closeAllSheets: () => void;
	toggleSheet: (sheetName: SheetName) => void;
	isSheetOpen: (sheetName: SheetName) => boolean;
	getSheetIndex: (sheetName: SheetName) => number;
};

export const useSheetStore = create<SheetState>()((set, get) => ({
	openSheets: [],

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
			return { openSheets: [...state.openSheets, sheetName] };
		}),

	isSheetOpen: (sheetName: SheetName) => get().openSheets.includes(sheetName),

	getSheetIndex: (sheetName: SheetName) => get().openSheets.indexOf(sheetName),
}));
