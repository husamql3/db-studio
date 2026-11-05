import { LIMIT } from "@db-studio/shared/constants";
import { BYOK_HEADERS, chatSchema } from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { HTTPException } from "@/http-exception.js";
import { isLoopbackHostname } from "@/loopback.js";
import { currentRequestId, writeOperationalLog } from "@/operational-log.js";
import { generateSystemPrompt } from "@/routes/chat/system-prompt-generator.js";
import { getDetailedSchema } from "@/routes/chat/table-details-schema.js";

/** The body is re-framed for the browser, so the upstream framing headers do not apply. */
const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"transfer-encoding",
	"content-length",
	"content-encoding",
]);

/**
 * BYOK API keys are forwarded to the proxy as request headers, so the
 * destination must be encrypted. `DB_STUDIO_PROXY_URL` can override the HTTPS
 * default, so plain HTTP is only tolerated when it points at loopback — the
 * local `bun run dev` proxy.
 */
const resolveProxyUrl = (): string => {
	// Read per request: the CLI loads .env after this module is imported.
	const configured =
		process.env.DB_STUDIO_PROXY_URL ??
		(process.env.NODE_ENV === "development"
			? "https://proxy.db-studio.localhost"
			: "https://db-studio-proxy.husamql3.workers.dev");

	let url: URL;

	try {
		url = new URL(configured);
	} catch {
		throw new HTTPException(500, {
			message: "DB_STUDIO_PROXY_URL is not a valid URL",
		});
	}

	const isLoopback = isLoopbackHostname(url.hostname);

	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new HTTPException(500, {
			message: "DB_STUDIO_PROXY_URL must use HTTPS unless it points at loopback",
		});
	}

	return url.origin;
};

/**
 * The headers the proxy reads from the browser's request: the client IP headers, so its rate
 * limiter keys on the real user, the API key, and `extra` (the BYOK keys for a chat request).
 */
const proxyHeaders = (
	headers: Record<string, string | undefined>,
	extra: readonly string[] = [],
): Record<string, string> => ({
	...Object.fromEntries(
		["cf-connecting-ip", "x-real-ip", "x-forwarded-for", "x-api-key", ...extra].map((name) => [
			name,
			headers[name] ?? "",
		]),
	),
	"x-request-id": currentRequestId() ?? "",
});

export const chatRoutes = new Elysia({ prefix: "/chat" })
	.get("/limit", async ({ headers }) => {
		// Outside the try: a misconfigured proxy URL is a server error, not an
		// exhausted quota, so it must not be masked by the fallback below.
		const proxyUrl = resolveProxyUrl();

		try {
			const proxyResponse = await fetch(`${proxyUrl}/chat/limit`, {
				headers: {
					...proxyHeaders(headers),
				},
			});

			if (!proxyResponse.ok) {
				writeOperationalLog("warn", "chat_limit_unavailable", {
					proxy_status: proxyResponse.status,
				});

				return { limit: LIMIT, used: LIMIT, remaining: 0 };
			}

			return await proxyResponse.json();
		} catch {
			// An unreachable proxy (offline, or not running in dev) is expected; not worth a log line.
			return { limit: LIMIT, used: LIMIT, remaining: 0 };
		}
	})

	/** Streams the proxy's answer; the proxy holds the hosted provider's API key. */
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

			const proxyResponse = await fetch(`${resolveProxyUrl()}/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...proxyHeaders(headers, BYOK_HEADERS),
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
