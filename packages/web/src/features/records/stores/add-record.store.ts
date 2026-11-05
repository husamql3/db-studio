import { create } from "zustand";
import { useOverlayStore } from "@/stores/overlay.store";

type AddRecordStore = {
	/** Values the add-record form opens with, such as a duplicated row's. */
	prefill: Record<string, string> | null;
	clearPrefill: () => void;
};

export const useAddRecordStore = create<AddRecordStore>()((set) => ({
	prefill: null,
	clearPrefill: () => set({ prefill: null }),
}));

export const openAddRecord = (prefill?: Record<string, string>) => {
	useAddRecordStore.setState({ prefill: prefill ?? null });
	useOverlayStore.getState().openOverlay("records.add-record");
};
