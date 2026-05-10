import { create } from "zustand";

type RecordReferenceStore = {
	tableName: string | null;
	columnName: string | null;
	referencedColumn: string | null;
	setRecordReference: (
		tableName: string,
		columnName: string,
		referencedColumn: string,
	) => void;
	clearRecordReference: () => void;
};

export const useRecordReferenceStore = create<RecordReferenceStore>()((set) => ({
	tableName: null,
	columnName: null,
	referencedColumn: null,

	setRecordReference: (tableName, columnName, referencedColumn) =>
		set({ tableName, columnName, referencedColumn }),

	clearRecordReference: () =>
		set({ tableName: null, columnName: null, referencedColumn: null }),
}));
