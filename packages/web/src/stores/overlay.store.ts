import { create } from "zustand";

export type OverlayId =
	| "table-builder.create-table"
	| `table-builder.add-foreign-key-${number}`
	| "schema.add-column"
	| "schema.edit-column"
	| "records.add-record"
	| "records.bulk-insert"
	| "records.bulk-insert-csv"
	| "records.bulk-insert-excel"
	| "records.bulk-insert-json"
	| "records.record-reference"
	| "chat.assistant";

type OverlayState = {
	openOverlays: OverlayId[];
	openOverlay: (id: OverlayId) => void;
	closeOverlay: (id?: OverlayId) => void;
	closeAllOverlays: () => void;
	toggleOverlay: (id: OverlayId) => void;
	isOverlayOpen: (id: OverlayId) => boolean;
	getOverlayIndex: (id: OverlayId) => number;
};

export const useOverlayStore = create<OverlayState>()((set, get) => ({
	openOverlays: [],

	openOverlay: (id) =>
		set((state) => {
			if (state.openOverlays.includes(id)) {
				return {
					openOverlays: [...state.openOverlays.filter((o) => o !== id), id],
				};
			}
			return { openOverlays: [...state.openOverlays, id] };
		}),

	closeOverlay: (id?) =>
		set((state) => {
			if (!id) return { openOverlays: state.openOverlays.slice(0, -1) };
			return { openOverlays: state.openOverlays.filter((o) => o !== id) };
		}),

	closeAllOverlays: () => set({ openOverlays: [] }),

	toggleOverlay: (id) =>
		set((state) => {
			if (state.openOverlays.includes(id)) {
				return { openOverlays: state.openOverlays.filter((o) => o !== id) };
			}
			return { openOverlays: [...state.openOverlays, id] };
		}),

	isOverlayOpen: (id) => get().openOverlays.includes(id),

	getOverlayIndex: (id) => get().openOverlays.indexOf(id),
}));
