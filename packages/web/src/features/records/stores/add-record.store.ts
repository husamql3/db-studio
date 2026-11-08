import { create } from "zustand";

type AddRecordStore = {
	/** Values the add-record form opens with, such as a duplicated row's. */
	prefill: Record<string, string> | null;
	setPrefill: (prefill: Record<string, string> | null) => void;
};

export const useAddRecordStore = create<AddRecordStore>()((set) => ({
	prefill: null,
	setPrefill: (prefill) => set({ prefill }),
}));
