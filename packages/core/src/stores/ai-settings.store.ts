import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AiProvider, MODEL_LIST } from "shared/constants";

type AiSettingsState = {
	includeSchemaInAiContext: boolean;
	useByocProxy: boolean;
	byocProxyUrl: string;
	provider: AiProvider;
	model: string;
	apiKeys: Partial<Record<AiProvider, string>>;
	setIncludeSchemaInAiContext: (value: boolean) => void;
	setUseByocProxy: (value: boolean) => void;
	setByocProxyUrl: (value: string) => void;
	setProvider: (value: AiProvider) => void;
	setModel: (value: string) => void;
	setApiKeyForProvider: (provider: AiProvider, apiKey: string) => void;
};

export const useAiSettingsStore = create<AiSettingsState>()(
	persist(
		(set) => ({
			includeSchemaInAiContext: true,
			useByocProxy: false,
			byocProxyUrl: "",
			provider: "gemini",
			model: MODEL_LIST.find((item) => item.provider === "gemini")?.id ?? "gemini-3-flash-preview",
			apiKeys: {},
			setIncludeSchemaInAiContext: (value) => set({ includeSchemaInAiContext: value }),
			setUseByocProxy: (value) => set({ useByocProxy: value }),
			setByocProxyUrl: (value) => set({ byocProxyUrl: value }),
			setProvider: (value) =>
				set((state) => {
					const providerModels = MODEL_LIST.filter((item) => item.provider === value);
					const nextModel = providerModels[0]?.id ?? state.model;
					return { provider: value, model: nextModel };
				}),
			setModel: (value) => set({ model: value }),
			setApiKeyForProvider: (provider, apiKey) =>
				set((state) => ({
					apiKeys: {
						...state.apiKeys,
						[provider]: apiKey,
					},
				})),
		}),
		{
			name: "db-studio-ai-settings",
		},
	),
);
