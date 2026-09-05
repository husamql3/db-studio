import { env } from "cloudflare:workers";
import { BYOK_LIMIT, LIMIT, ONE_DAY } from "@db-studio/shared/constants";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { getRedisStore } from "./redis";

export const keyGenerator = (c: Context) => {
	const cfConnectingIp = c.req.header("cf-connecting-ip");
	const xRealIp = c.req.header("x-real-ip");
	const xForwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();

	const identifier = cfConnectingIp ?? xRealIp ?? xForwardedFor ?? "anonymous";
	return identifier;
};

export const createProxyLimiter = (): MiddlewareHandler => {
	return async (c, next) => {
		if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
			console.warn("[proxy] Upstash Redis not configured — skipping rate limiter");
			return next();
		}

		// A BYOK header is not validated here — the provider validates the key when
		// the request is forwarded. So presence alone must not bypass the limiter;
		// it only moves the request onto a separate, higher-ceiling IP bucket.
		const hasPersonalKey = ["gemini", "openai", "anthropic", "grok", "openrouter"].some(
			(provider) => Boolean(c.req.header(`x-byok-${provider}`)?.trim()),
		);

		const prefix = hasPersonalKey ? "rate:proxy:byok:" : "rate:proxy:";
		const limiter = rateLimiter({
			windowMs: ONE_DAY,
			limit: hasPersonalKey ? BYOK_LIMIT : LIMIT,
			keyGenerator: keyGenerator,
			store: getRedisStore(c, prefix),
			standardHeaders: "draft-7",
			statusCode: 429,
			message: "Too many requests",
		});
		return limiter(c, next);
	};
};
