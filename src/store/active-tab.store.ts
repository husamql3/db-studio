import { create } from "zustand";

type ActiveTabStore = {
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
}

export const useActiveTabStore = create<ActiveTabStore>((set) => ({
  activeTab: null,
  setActiveTab: (tab) => {
    set({ activeTab: tab })
  },
}));