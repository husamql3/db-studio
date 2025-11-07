import { create } from "zustand";

type ActiveTabStore = {
	activeTab: string | null;
	setActiveTab: (tabName: string | null) => void;
};

export const useActiveTabStore = create<ActiveTabStore>((set) => ({
	activeTab: "table",
	setActiveTab: (tabName) => {
		set({ activeTab: tabName });
		console.log("activeTab", tabName);
	},
}));
