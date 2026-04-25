import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DEFAULTS } from "shared/constants";
import { chatSchema } from "shared/types";
import { getDetailedSchema } from "@/dao/table-details-schema.js";
import { generateSystemPrompt } from "@/utils/system-prompt-generator.js";

export const chatRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/chat/...
	 */
	.basePath("/chat")

	/**
	 * GET /chat/limit - Proxy rate limit check to Cloudflare Worker
	 */
	.get("/limit", async (c) => {
		const proxyResponse = await fetch(`${DEFAULTS.PROXY_URL}/chat/limit`, {
			headers: {
				"cf-connecting-ip": c.req.header("cf-connecting-ip") ?? "",
				"x-real-ip": c.req.header("x-real-ip") ?? "",
				"x-forwarded-for": c.req.header("x-forwarded-for") ?? "",
				"x-api-key": c.req.header("x-api-key") ?? "",
			},
		});
		const data = await proxyResponse.json();
		return c.json(data, proxyResponse.status as 200 | 500);
	})

	/**
	 * POST /chat - Handle AI chat requests with streaming
	 * Proxies to the Cloudflare Worker which has the Gemini API key
	 */
	.post("/", zValidator("json", chatSchema), async (c) => {
		const { messages, data } = c.req.valid("json");
		const { db, conversationId } = data;
		console.log("POST /chat messages", messages);

		// Get the database schema and generate system prompt
		const schema = await getDetailedSchema(db);
		const systemPrompt = generateSystemPrompt(schema);

		const payload = {
			messages,
			conversationId,
			systemPrompt,
		};

		// Forward request to the proxy with the system prompt.
		// Pass through IP headers so the proxy rate-limiter keys on the real user IP.
		const proxyResponse = await fetch(`${DEFAULTS.PROXY_URL}/chat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"cf-connecting-ip": c.req.header("cf-connecting-ip") ?? "",
				"x-real-ip": c.req.header("x-real-ip") ?? "",
				"x-forwarded-for": c.req.header("x-forwarded-for") ?? "",
				"x-api-key": c.req.header("x-api-key") ?? "",
			},
			body: JSON.stringify(payload),
		});

		if (!proxyResponse.ok) {
			const errorData = await proxyResponse.json();
			return c.json(
				{ error: errorData.error || "Proxy request failed" },
				proxyResponse.status as 400 | 500,
			);
		}

		// Stream the SSE response back to the client
		const { readable, writable } = new TransformStream();
		proxyResponse.body?.pipeTo(writable);

		return new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	});

export type ChatRoutes = typeof chatRoutes;
