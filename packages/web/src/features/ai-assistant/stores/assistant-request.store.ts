import { create } from "zustand";

interface AssistantRequestStore {
	pendingPrompt: string | null;
	requestAssistant: (prompt: string) => void;
	consumePrompt: () => void;
}

export const useAssistantRequestStore = create<AssistantRequestStore>()((set) => ({
	pendingPrompt: null,
	requestAssistant: (pendingPrompt) => set({ pendingPrompt }),
	consumePrompt: () => set({ pendingPrompt: null }),
}));
