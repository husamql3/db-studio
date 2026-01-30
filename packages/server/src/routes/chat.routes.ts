import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { DEFAULTS } from "shared/constants";
import { chatSchema } from "shared/types";
import { getDetailedSchema } from "@/dao/table-details-schema.js";
import {
	generateSystemPrompt,
	getMinimalSystemPrompt,
} from "@/utils/system-prompt-generator.js";

/** Validate BYOC proxy URL: https only to avoid SSRF */
function getProxyUrl(proxyUrl?: string): string {
	if (!proxyUrl || !proxyUrl.trim()) return DEFAULTS.PROXY_URL;
	try {
		const url = new URL(proxyUrl.trim());
		if (url.protocol !== "https:") return DEFAULTS.PROXY_URL;
		return url.origin;
	} catch {
		return DEFAULTS.PROXY_URL;
	}
}

export const chatRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/chat/...
	 */
	.basePath("/chat")

	/**
	 * POST /chat - Handle AI chat requests with streaming
	 * Proxies to the Cloudflare Worker which has the Gemini API key (or BYOC URL)
	 */
	.post("/", zValidator("json", chatSchema), async (c) => {
		const {
			messages,
			conversationId,
			db,
			includeSchemaInAiContext,
			proxyUrl: clientProxyUrl,
		} = c.req.valid("json");
		console.log("POST /chat messages", messages);

		const useSchemaContext = includeSchemaInAiContext !== false;
		let systemPrompt: string;
		if (useSchemaContext) {
			const schema = await getDetailedSchema(db);
			systemPrompt = generateSystemPrompt(schema);
		} else {
			systemPrompt = getMinimalSystemPrompt();
		}

		const payload = {
			messages,
			conversationId,
			systemPrompt,
		};

		const proxyBaseUrl = getProxyUrl(clientProxyUrl);

		// Forward request to the proxy with the system prompt
		const proxyResponse = await fetch(`${proxyBaseUrl}/chat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
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
