import { create } from "zustand";

type RowDetailsStore = {
	tableName: string | null;
	rowIndex: number | null;
	setRowDetails: (tableName: string, rowIndex: number) => void;
	selectRowDetails: (rowIndex: number) => void;
	clearRowDetails: () => void;
};

export const useRowDetailsStore = create<RowDetailsStore>()((set) => ({
	tableName: null,
	rowIndex: null,

	setRowDetails: (tableName, rowIndex) => set({ tableName, rowIndex }),

	selectRowDetails: (rowIndex) => set({ rowIndex }),

	clearRowDetails: () => set({ tableName: null, rowIndex: null }),
}));
