import { create } from "zustand";

type AiPrefillState = {
	prefillMessage: string | null;
	setPrefillMessage: (message: string | null) => void;
};

export const useAiPrefillStore = create<AiPrefillState>()((set) => ({
	prefillMessage: null,
	setPrefillMessage: (message) => set({ prefillMessage: message }),
}));
