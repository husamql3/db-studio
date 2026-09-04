import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AiSettingsStore {
	includeSchemaInAiContext: boolean;
	setIncludeSchemaInAiContext: (include: boolean) => void;
}

export const useAiSettingsStore = create<AiSettingsStore>()(
	persist(
		(set) => ({
			includeSchemaInAiContext: true,
			setIncludeSchemaInAiContext: (includeSchemaInAiContext) =>
				set({ includeSchemaInAiContext }),
		}),
		{ name: "db-studio-ai-settings" },
	),
);
