import { LIMIT } from "@db-studio/shared/constants";
import {
	AI_PROVIDER_OPTIONS,
	type AiModel,
	type AiProvider,
	BYOK_HEADERS,
} from "@db-studio/shared/types";
import { chat, EventType, type ModelMessage, toServerSentEventsResponse } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { createGrokText } from "@tanstack/ai-grok";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { getByokKey } from "@tanstack/ai/byok/server";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createProxyLimiter, keyGenerator } from "./limit";
import { errorType, type ProxyEnv, requestId, writeLog } from "./log";
import { getRedis, RATE_LIMIT_PREFIX } from "./redis";

const app = new Hono<ProxyEnv>();

app.use("/*", requestId);

app.use(
	"/*",
	cors({
		origin: "*",
		allowMethods: ["POST", "GET", "OPTIONS"],
		allowHeaders: ["Content-Type", "x-api-key", "x-request-id", ...BYOK_HEADERS],
		exposeHeaders: ["x-request-id"],
	}),
);

app.use("/chat", createProxyLimiter());

/** POST /chat streams a chat completion from the requested provider. */
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
					return createGeminiChat(model as AiModel<"gemini">, apiKey);
				case "openai":
					return createOpenaiChat(model as AiModel<"openai">, apiKey);
				case "anthropic":
					return createAnthropicChat(model as AiModel<"anthropic">, apiKey);
				case "grok":
					return createGrokText(model as AiModel<"grok">, apiKey);
				case "openrouter":
					return createOpenRouterText(model as AiModel<"openrouter">, apiKey);
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

/** GET /chat/limit reports how many hosted-key messages the caller has left today. */
app.get("/chat/limit", async (c) => {
	try {
		if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
			return c.json({ limit: LIMIT, used: 0, remaining: LIMIT });
		}

		const used = (await getRedis().get<number>(`${RATE_LIMIT_PREFIX}${keyGenerator(c)}`)) ?? 0;

		return c.json({ limit: LIMIT, used, remaining: Math.max(0, LIMIT - used) });
	} catch (error) {
		writeLog(c, "error", "chat_limit_failed", { error_type: errorType(error) });

		return c.json({ error: "Message limit unavailable", requestId: c.get("requestId") }, 503);
	}
});

export default app;
