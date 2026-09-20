import { create } from "zustand";

type RowDetailsStore = {
	tableName: string | null;
	rowIndex: number | null;
	isDirty: boolean;
	setRowDetails: (tableName: string, rowIndex: number) => void;
	selectRowDetails: (rowIndex: number) => void;
	clearRowDetails: () => void;
	setDirty: (isDirty: boolean) => void;
};

export const useRowDetailsStore = create<RowDetailsStore>()((set) => ({
	tableName: null,
	rowIndex: null,
	isDirty: false,

	setRowDetails: (tableName, rowIndex) => set({ tableName, rowIndex }),

	selectRowDetails: (rowIndex) => set({ rowIndex }),

	clearRowDetails: () => set({ tableName: null, rowIndex: null, isDirty: false }),

	setDirty: (isDirty) => set({ isDirty }),
}));
