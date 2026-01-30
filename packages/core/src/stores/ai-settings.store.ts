import { create } from "zustand";
import { persist } from "zustand/middleware";

type AiSettingsState = {
	includeSchemaInAiContext: boolean;
	useByocProxy: boolean;
	byocProxyUrl: string;
	setIncludeSchemaInAiContext: (value: boolean) => void;
	setUseByocProxy: (value: boolean) => void;
	setByocProxyUrl: (value: string) => void;
};

export const useAiSettingsStore = create<AiSettingsState>()(
	persist(
		(set) => ({
			includeSchemaInAiContext: true,
			useByocProxy: false,
			byocProxyUrl: "",
			setIncludeSchemaInAiContext: (value) => set({ includeSchemaInAiContext: value }),
			setUseByocProxy: (value) => set({ useByocProxy: value }),
			setByocProxyUrl: (value) => set({ byocProxyUrl: value }),
		}),
		{
			name: "db-studio-ai-settings",
		},
	),
);
