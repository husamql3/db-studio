import { env } from "cloudflare:workers";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { LIMIT } from "shared/constants";
import { createProxyLimiter, keyGenerator } from "./limit";
import { getRedis } from "./redis";

const app = new Hono();

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
		const { messages, systemPrompt, conversationId } = await c.req.json();
		if (!messages || !Array.isArray(messages)) {
			return c.json({ error: "Invalid request: messages array required" }, 400);
		}

		console.log("messages", messages);
		console.log("systemPrompt", systemPrompt);
		console.log("conversationId", conversationId);

		const stream = chat({
			adapter: createGeminiChat("gemini-3-flash-preview", env.GEMINI_API_KEY, {
				temperature: 0.1, // Very low - we want deterministic, accurate SQL
				topP: 0.9, // Very low - we want deterministic, accurate SQL
				maxOutputTokens: 1024, // Short responses - SQL + brief explanation
			}),
			messages,
			conversationId,
			systemPrompts: [systemPrompt],
		});

		return toServerSentEventsResponse(stream);
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
