import { create } from "zustand";

type ActiveTableStore = {
	activeTable: string | null;
	setActiveTable: (tableName: string | null) => void;
};

export const useActiveTableStore = create<ActiveTableStore>((set) => ({
	activeTable: null,
	setActiveTable: (tableName) => {
		set({ activeTable: tableName });
	},
}));
