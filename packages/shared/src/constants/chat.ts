export const CHAT_SUGGESTIONS = [
	"Show me all tables in my database",
	"What columns are in the users table?",
	"Write a query to find all active users",
	"How many orders were placed last month?",
	"Find top 5 customers by total spend",
	"Write a JOIN between users and orders",
	"Users who haven't made any purchase yet",
	"Generate monthly revenue summary query",
	"Suggest useful indexes for better performance",
	"Show schema of the products / inventory table",
	"Latest 20 orders with customer names",
	"Help me write a safe UPDATE query",
];

export const AI_PROVIDERS = ["gemini", "openai", "anthropic"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const MODEL_LIST = [
	{
		id: "gemini-3-flash-preview",
		name: "Gemini 3 Flash Preview",
		provider: "gemini",
	},
	{
		id: "gemini-2.0-flash-exp",
		name: "Gemini 2.0 Flash",
		provider: "gemini",
	},
	{
		id: "gpt-4o",
		name: "GPT-4o",
		provider: "openai",
	},
	{
		id: "gpt-4o-mini",
		name: "GPT-4o Mini",
		provider: "openai",
	},
	{
		id: "claude-3-5-sonnet-20241022",
		name: "Claude 3.5 Sonnet",
		provider: "anthropic",
	},
	{
		id: "claude-3-opus-20240229",
		name: "Claude 3 Opus",
		provider: "anthropic",
	},
] as const;

export const MODELS_BY_PROVIDER = MODEL_LIST.reduce(
	(acc, model) => {
		acc[model.provider] ??= [];
		acc[model.provider]?.push(model);
		return acc;
	},
	{} as Record<AiProvider, (typeof MODEL_LIST)[number][]>,
);
