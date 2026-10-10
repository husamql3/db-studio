import type { IndexInfoSchemaType } from "@db-studio/shared/types";
import { create } from "zustand";

type IndexDropState = {
	droppingIndex: IndexInfoSchemaType | null;
	setDroppingIndex: (index: IndexInfoSchemaType | null) => void;
};

export const useIndexDropStore = create<IndexDropState>()((set) => ({
	droppingIndex: null,
	setDroppingIndex: (index) => set({ droppingIndex: index }),
}));
