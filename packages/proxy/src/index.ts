import { LIMIT } from "shared/constants";
import { env } from "cloudflare:workers";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { createOpenaiChat, openaiText } from "@tanstack/ai-openai";
import { createAnthropicChat, anthropicText } from "@tanstack/ai-anthropic";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createProxyLimiter, keyGenerator } from "./limit";
import { getRedis } from "./redis";

const app = new Hono();

const DEFAULT_MODELS = {
	gemini: "gemini-3-flash-preview",
	openai: "gpt-4o",
	anthropic: "claude-3-5-sonnet-20241022",
} as const;

type Provider = keyof typeof DEFAULT_MODELS;

const buildAdapter = ({
	provider,
	model,
	apiKey,
}: {
	provider?: Provider;
	model?: string;
	apiKey?: string;
}) => {
	const resolvedProvider =
		provider && provider in DEFAULT_MODELS ? provider : "gemini";
	const resolvedModel = model ?? DEFAULT_MODELS[resolvedProvider];

	if (resolvedProvider === "openai") {
		const model = resolvedModel as Parameters<typeof createOpenaiChat>[0];
		if (apiKey) {
			return createOpenaiChat(model, apiKey);
		}
		return openaiText(model);
	}

	if (resolvedProvider === "anthropic") {
		const model = resolvedModel as Parameters<typeof createAnthropicChat>[0];
		if (apiKey) {
			return createAnthropicChat(model, apiKey);
		}
		return anthropicText(model);
	}

	const geminiModel = resolvedModel as Parameters<typeof createGeminiChat>[0];
	return createGeminiChat(geminiModel, apiKey ?? env.GEMINI_API_KEY, {
		temperature: 0.1,
		topP: 0.9,
		maxOutputTokens: 1024,
	});
};

app.use(
	"/*",
	cors({
		origin: "*",
		allowMethods: ["POST", "GET", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"x-api-key",
			"cf-connecting-ip",
			"x-real-ip",
			"x-forwarded-for",
		],
	}),
);

//* Apply rate limiters
app.use("/chat", createProxyLimiter());

/**
 * POST /chat - Proxy chat requests to Gemini API
 */
app.post("/chat", async (c) => {
	try {
		const { messages, systemPrompt, conversationId, provider, model, apiKey } =
			await c.req.json();
		if (!messages || !Array.isArray(messages)) {
			return c.json({ error: "Invalid request: messages array required" }, 400);
		}

		console.log("messages", messages);
		console.log("systemPrompt", systemPrompt);
		console.log("conversationId", conversationId);

		const stream = await chat({
			adapter: buildAdapter({ provider, model, apiKey }),
			messages,
			conversationId,
			systemPrompts: [systemPrompt],
		});

		return toServerSentEventsResponse(
			stream as Parameters<typeof toServerSentEventsResponse>[0],
		);
	} catch (error) {
		console.error("Proxy error:", error);
		const errorMessage = error instanceof Error ? error.message : "An error occurred";
		return c.json({ error: errorMessage }, 500);
	}
});

/**
 * GET /chat/limit - Get remaining message limit for user
 */
app.get("/chat/limit", async (c) => {
	try {
		const key = keyGenerator(c);
		const usageKey = `rate:proxy:${key}`;

		// Get current usage from Redis
		const redis = getRedis(c);
		const currentUsage = (await redis.get<number>(usageKey)) ?? 0;
		const remaining = Math.max(0, LIMIT - currentUsage);

		return c.json({
			limit: LIMIT,
			used: currentUsage,
			remaining,
		});
	} catch (error) {
		console.error("Error fetching limit:", error);
		return c.json({ error: "Failed to fetch limit" }, 500);
	}
});

app.get("/", (c) => {
	return c.json({
		status: "ok",
		service: "db-studio-proxy",
		endpoints: ["/chat", "/chat/limit"],
	});
});

app.get("/favicon.ico", (c) => {
	return c.body(null, 204);
});

export default app;
