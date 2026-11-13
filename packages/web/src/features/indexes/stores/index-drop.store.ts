import type { IndexInfoSchemaType } from "@db-studio/shared/types";
import { create } from "zustand";
import { onConnectionReset } from "@/stores/connection-reset";

type IndexDropState = {
	droppingIndex: IndexInfoSchemaType | null;
	setDroppingIndex: (index: IndexInfoSchemaType | null) => void;
};

export const useIndexDropStore = create<IndexDropState>()((set) => ({
	droppingIndex: null,
	setDroppingIndex: (index) => set({ droppingIndex: index }),
}));

onConnectionReset(() => useIndexDropStore.setState(useIndexDropStore.getInitialState(), true));
