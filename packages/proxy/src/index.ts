import { env } from "cloudflare:workers";
import { LIMIT } from "@db-studio/shared/constants";
import { AI_PROVIDER_OPTIONS, type AiProvider } from "@db-studio/shared/types";
import { chat, EventType, type ModelMessage, toServerSentEventsResponse } from "@tanstack/ai";
import { getByokKey } from "@tanstack/ai/byok/server";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { createGrokText } from "@tanstack/ai-grok";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createProxyLimiter, keyGenerator } from "./limit";
import { errorType, type ProxyEnv, requestId, writeLog } from "./log";
import { getRedis } from "./redis";

const app = new Hono<ProxyEnv>();

app.use("/*", requestId);

app.use(
	"/*",
	cors({
		origin: "*",
		allowMethods: ["POST", "GET", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"x-api-key",
			"x-request-id",
			"cf-connecting-ip",
			"x-real-ip",
			"x-forwarded-for",
			"x-byok-gemini",
			"x-byok-openai",
			"x-byok-anthropic",
			"x-byok-grok",
			"x-byok-openrouter",
		],
		exposeHeaders: ["x-request-id"],
	}),
);

//* Apply rate limiters
app.use("/chat", createProxyLimiter());

/**
 * POST /chat - Proxy chat requests to Gemini API
 */
app.post("/chat", async (c) => {
	// Declared out here so a failure log can say which provider and model it was for.
	let provider: AiProvider | undefined;
	let model: string | undefined;
	let byok = false;
	try {
		const body = await c.req.json<{
			messages: ModelMessage[];
			systemPrompt: string;
			conversationId?: string;
			provider: AiProvider;
			model: string;
		}>();
		const { messages, systemPrompt, conversationId } = body;
		provider = body.provider;
		model = body.model;
		if (!messages || !Array.isArray(messages)) {
			return c.json({ error: "Invalid request: messages array required" }, 400);
		}

		const providerOption = AI_PROVIDER_OPTIONS.find((option) => option.id === provider);
		if (!providerOption?.models.some((option) => option.id === model)) {
			return c.json({ error: "Unsupported AI provider or model" }, 400);
		}

		const byokKey = getByokKey(c.req.raw, provider);
		byok = Boolean(byokKey);
		const apiKey = byokKey ?? (provider === "gemini" ? env.GEMINI_API_KEY : null);
		if (!apiKey) {
			return c.json({ error: `An API key is required for ${providerOption.label}` }, 401);
		}

		const adapter = (() => {
			switch (provider) {
				case "gemini":
					return createGeminiChat(
						model as "gemini-3-flash-preview" | "gemini-2.5-pro",
						apiKey,
					);
				case "openai":
					return createOpenaiChat(model as "gpt-5.2" | "gpt-5-mini", apiKey);
				case "anthropic":
					return createAnthropicChat(
						model as "claude-sonnet-4-6" | "claude-haiku-4-5",
						apiKey,
					);
				case "grok":
					return createGrokText(model as "grok-4.6" | "grok-4.5", apiKey);
				case "openrouter":
					return createOpenRouterText(
						model as "openai/gpt-5.2" | "anthropic/claude-sonnet-4.6",
						apiKey,
					);
			}
		})();

		const stream = chat({
			adapter,
			messages,
			conversationId,
			systemPrompts: [systemPrompt],
		});

		// A provider failure (bad key, quota, outage) surfaces while the stream is
		// read, after this handler has returned, and usually as a RUN_ERROR chunk
		// rather than a throw, so it has to be logged from inside the stream.
		const failure = { provider, model, byok: String(byok) };
		const logged = (async function* () {
			try {
				for await (const chunk of stream) {
					if (chunk.type === EventType.RUN_ERROR) {
						writeLog(c, "error", "chat_stream_failed", {
							...failure,
							error_code: chunk.code,
						});
					}
					yield chunk;
				}
			} catch (error) {
				writeLog(c, "error", "chat_stream_failed", {
					...failure,
					error_type: errorType(error),
				});
				throw error;
			}
		})();

		return toServerSentEventsResponse(logged);
	} catch (error) {
		writeLog(c, "error", "chat_request_failed", {
			provider,
			model,
			byok: String(byok),
			error_type: errorType(error),
		});
		return c.json({ error: "AI request failed", requestId: c.get("requestId") }, 500);
	}
});

/**
 * GET /chat/limit - Get remaining message limit for user
 */
app.get("/chat/limit", async (c) => {
	try {
		if (!c.env.UPSTASH_REDIS_REST_URL || !c.env.UPSTASH_REDIS_REST_TOKEN) {
			return c.json({ limit: LIMIT, used: 0, remaining: LIMIT });
		}

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
		writeLog(c, "error", "chat_limit_failed", { error_type: errorType(error) });
		return c.json({ limit: LIMIT, used: LIMIT, remaining: 0 });
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
