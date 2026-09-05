import { DEFAULTS, LIMIT } from "@db-studio/shared/constants";
import { chatSchema } from "@db-studio/shared/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RouteEnv } from "@/app.types.js";
import { generateSystemPrompt } from "@/utils/system-prompt-generator.js";
import { getDetailedSchema } from "@/utils/table-details-schema.js";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * BYOK API keys are forwarded to the proxy as request headers, so the
 * destination must be encrypted. `DB_STUDIO_PROXY_URL` can override the HTTPS
 * default, so plain HTTP is only tolerated when it points at loopback — the
 * local `bun run dev` proxy.
 */
const resolveProxyUrl = (): string => {
	let url: URL;
	try {
		url = new URL(DEFAULTS.PROXY_URL);
	} catch {
		throw new HTTPException(500, {
			message: "DB_STUDIO_PROXY_URL is not a valid URL",
		});
	}

	const isLoopback =
		LOOPBACK_HOSTNAMES.has(url.hostname) || url.hostname.endsWith(".localhost");
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new HTTPException(500, {
			message: "DB_STUDIO_PROXY_URL must use HTTPS unless it points at loopback",
		});
	}

	return url.origin;
};

export const chatRoutes = new Hono<RouteEnv>()
	/**
	 * Base path for the endpoints, /:dbType/chat/...
	 */
	.basePath("/chat")

	/**
	 * GET /chat/limit - Proxy rate limit check to Cloudflare Worker
	 */
	.get("/limit", async (c) => {
		// Outside the try: a misconfigured proxy URL is a server error, not an
		// exhausted quota, so it must not be masked by the fallback below.
		const proxyUrl = resolveProxyUrl();

		try {
			const proxyResponse = await fetch(`${proxyUrl}/chat/limit`, {
				headers: {
					"cf-connecting-ip": c.req.header("cf-connecting-ip") ?? "",
					"x-real-ip": c.req.header("x-real-ip") ?? "",
					"x-forwarded-for": c.req.header("x-forwarded-for") ?? "",
					"x-api-key": c.req.header("x-api-key") ?? "",
				},
			});
			if (!proxyResponse.ok) {
				return c.json({ limit: LIMIT, used: LIMIT, remaining: 0 }, 200);
			}
			return c.json(await proxyResponse.json(), 200);
		} catch {
			return c.json({ limit: LIMIT, used: LIMIT, remaining: 0 }, 200);
		}
	})

	/**
	 * POST /chat - Handle AI chat requests with streaming
	 * Proxies to the Cloudflare Worker which has the Gemini API key
	 */
	.post("/", zValidator("json", chatSchema), async (c) => {
		const { messages, data, provider, model } = c.req.valid("json");
		const { db, conversationId, includeSchema } = data;

		// Get the database schema and generate system prompt
		const schema = includeSchema ? await getDetailedSchema(db) : null;
		const systemPrompt = generateSystemPrompt(schema);

		const payload = {
			messages,
			conversationId,
			systemPrompt,
			provider,
			model,
		};

		// Forward request to the proxy with the system prompt.
		// Pass through IP headers so the proxy rate-limiter keys on the real user IP.
		const proxyResponse = await fetch(`${resolveProxyUrl()}/chat`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"cf-connecting-ip": c.req.header("cf-connecting-ip") ?? "",
				"x-real-ip": c.req.header("x-real-ip") ?? "",
				"x-forwarded-for": c.req.header("x-forwarded-for") ?? "",
				"x-api-key": c.req.header("x-api-key") ?? "",
				"x-byok-gemini": c.req.header("x-byok-gemini") ?? "",
				"x-byok-openai": c.req.header("x-byok-openai") ?? "",
				"x-byok-anthropic": c.req.header("x-byok-anthropic") ?? "",
				"x-byok-grok": c.req.header("x-byok-grok") ?? "",
				"x-byok-openrouter": c.req.header("x-byok-openrouter") ?? "",
			},
			body: JSON.stringify(payload),
		});

		if (!proxyResponse.ok) {
			const errorData = await proxyResponse.json();
			return c.json(
				{ error: errorData.error || "Proxy request failed" },
				proxyResponse.status as 400 | 401 | 500,
			);
		}

		// Relay the original stream directly. A detached pipe can reject after this
		// handler returns, which makes the browser see only a generic body-read error.
		return new Response(proxyResponse.body, {
			status: proxyResponse.status,
			headers: proxyResponse.headers,
		});
	});

export type ChatRoutes = typeof chatRoutes;
