import { create } from "zustand";
import { onConnectionReset } from "@/stores/connection-reset";

type RowDetailsStore = {
	rowIndex: number | null;
	isDirty: boolean;
	selectRowDetails: (rowIndex: number) => void;
	clearRowDetails: () => void;
	setDirty: (isDirty: boolean) => void;
};

export const useRowDetailsStore = create<RowDetailsStore>()((set) => ({
	rowIndex: null,
	isDirty: false,

	selectRowDetails: (rowIndex) => set({ rowIndex }),

	clearRowDetails: () => set({ rowIndex: null, isDirty: false }),

	setDirty: (isDirty) => set({ isDirty }),
}));

onConnectionReset(() => useRowDetailsStore.getState().clearRowDetails());
