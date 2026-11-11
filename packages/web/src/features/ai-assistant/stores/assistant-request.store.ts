import { create } from "zustand";
import { useOverlayStore } from "@/stores/overlay.store";

interface AssistantRequestStore {
	pendingPrompt: string | null;
	consumePrompt: () => void;
}

export const useAssistantRequestStore = create<AssistantRequestStore>()((set) => ({
	pendingPrompt: null,
	consumePrompt: () => set({ pendingPrompt: null }),
}));

/** Opens the assistant and queues `prompt`; the chat sends it once it can. */
export const askAssistant = (prompt: string) => {
	useAssistantRequestStore.setState({ pendingPrompt: prompt });
	useOverlayStore.getState().openOverlay("chat.assistant");
};
