import { DEFAULTS, LIMIT } from "@db-studio/shared/constants";
import { chatSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { HTTPException } from "@/http-exception.js";
import { currentRequestId, errorFields, writeOperationalLog } from "@/operational-log.js";
import { generateSystemPrompt } from "@/utils/system-prompt-generator.js";
import { getDetailedSchema } from "@/utils/table-details-schema.js";

/** The body is re-framed for the browser, so the upstream framing headers do not apply. */
const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"transfer-encoding",
	"content-length",
	"content-encoding",
]);

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

export const chatRoutes = new Elysia({ prefix: "/chat" })
	/**
	 * GET /chat/limit - Proxy rate limit check to Cloudflare Worker
	 */
	.get("/limit", async ({ headers }) => {
		// Outside the try: a misconfigured proxy URL is a server error, not an
		// exhausted quota, so it must not be masked by the fallback below.
		const proxyUrl = resolveProxyUrl();

		try {
			const proxyResponse = await fetch(`${proxyUrl}/chat/limit`, {
				headers: {
					"cf-connecting-ip": headers["cf-connecting-ip"] ?? "",
					"x-real-ip": headers["x-real-ip"] ?? "",
					"x-forwarded-for": headers["x-forwarded-for"] ?? "",
					"x-api-key": headers["x-api-key"] ?? "",
					"x-request-id": currentRequestId() ?? "",
				},
			});
			if (!proxyResponse.ok) {
				writeOperationalLog("warn", "chat_limit_unavailable", {
					proxy_status: proxyResponse.status,
				});
				return { limit: LIMIT, used: LIMIT, remaining: 0 };
			}
			return await proxyResponse.json();
		} catch (error) {
			writeOperationalLog("warn", "chat_limit_unavailable", errorFields(error));
			return { limit: LIMIT, used: LIMIT, remaining: 0 };
		}
	})

	/**
	 * POST /chat - Handle AI chat requests with streaming
	 * Proxies to the Cloudflare Worker which has the Gemini API key
	 */
	.post(
		"/",
		async ({ body: { messages, data, provider, model }, headers, set }) => {
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
					"cf-connecting-ip": headers["cf-connecting-ip"] ?? "",
					"x-real-ip": headers["x-real-ip"] ?? "",
					"x-forwarded-for": headers["x-forwarded-for"] ?? "",
					"x-api-key": headers["x-api-key"] ?? "",
					"x-byok-gemini": headers["x-byok-gemini"] ?? "",
					"x-byok-openai": headers["x-byok-openai"] ?? "",
					"x-byok-anthropic": headers["x-byok-anthropic"] ?? "",
					"x-byok-grok": headers["x-byok-grok"] ?? "",
					"x-byok-openrouter": headers["x-byok-openrouter"] ?? "",
					"x-request-id": currentRequestId() ?? "",
				},
				body: JSON.stringify(payload),
			});

			if (!proxyResponse.ok) {
				writeOperationalLog("warn", "chat_proxy_rejected", {
					proxy_status: proxyResponse.status,
					provider,
					model,
				});
				const errorData = await proxyResponse.json();
				return Response.json(
					{ error: errorData.error || "Proxy request failed" },
					{ status: proxyResponse.status },
				);
			}

			// Relay the original stream directly. A detached pipe can reject after this
			// handler returns, which makes the browser see only a generic body-read error.
			// The headers go through `set`: Elysia on Node drops the headers of a returned
			// chunked Response, which would turn the event stream into text/plain.
			for (const [key, value] of proxyResponse.headers) {
				if (!HOP_BY_HOP_HEADERS.has(key)) set.headers[key] = value;
			}
			return proxyResponse.body;
		},
		{ body: chatSchema },
	);
