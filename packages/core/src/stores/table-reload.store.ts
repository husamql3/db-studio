import { create } from "zustand";

type TableReloadStore = {
	reloadKey: number;
	triggerReload: () => void;
};

export const useTableReloadStore = create<TableReloadStore>()((set) => ({
	reloadKey: 0,
	triggerReload: () => set((state) => ({ reloadKey: state.reloadKey + 1 })),
}));
