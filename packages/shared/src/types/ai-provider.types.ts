import { z } from "zod";

export const AI_PROVIDERS = ["gemini", "openai", "anthropic", "grok", "openrouter"] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const AI_PROVIDER_OPTIONS: ReadonlyArray<{
	id: AiProvider;
	label: string;
	models: ReadonlyArray<{ id: string; label: string }>;
}> = [
	{
		id: "gemini",
		label: "Google Gemini",
		models: [
			{ id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
			{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
		],
	},
	{
		id: "openai",
		label: "OpenAI",
		models: [
			{ id: "gpt-5.2", label: "GPT-5.2" },
			{ id: "gpt-5-mini", label: "GPT-5 mini" },
		],
	},
	{
		id: "anthropic",
		label: "Anthropic",
		models: [
			{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
			{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
		],
	},
	{
		id: "grok",
		label: "xAI Grok",
		models: [
			{ id: "grok-4.6", label: "Grok 4.6" },
			{ id: "grok-4.5", label: "Grok 4.5" },
		],
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		models: [
			{ id: "openai/gpt-5.2", label: "GPT-5.2 via OpenRouter" },
			{ id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 via OpenRouter" },
		],
	},
];

export const getDefaultAiModel = (provider: AiProvider): string =>
	AI_PROVIDER_OPTIONS.find((option) => option.id === provider)?.models[0]?.id ??
	"gemini-3-flash-preview";
