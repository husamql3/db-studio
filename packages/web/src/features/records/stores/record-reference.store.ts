import { create } from "zustand";
import { useOverlayStore } from "@/stores/overlay.store";

type RecordReference = {
	/** The referenced table the picker lists. */
	tableName: string;
	/** The add-record field the picked value goes into. */
	columnName: string;
	referencedColumn: string;
};

type RecordReferenceStore = {
	reference: RecordReference | null;
	clearRecordReference: () => void;
};

export const useRecordReferenceStore = create<RecordReferenceStore>()((set) => ({
	reference: null,
	clearRecordReference: () => set({ reference: null }),
}));

export const openRecordReference = (reference: RecordReference) => {
	useRecordReferenceStore.setState({ reference });
	useOverlayStore.getState().openOverlay("records.record-reference");
};
