import { BYOK_LIMIT, LIMIT, ONE_DAY } from "@db-studio/shared/constants";
import { aiProviderSchema, byokHeader } from "@db-studio/shared/types";
import { env } from "cloudflare:workers";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { writeLog } from "./log";
import { getRedisStore, RATE_LIMIT_PREFIX } from "./redis";

export const keyGenerator = (c: Context) => {
	const cfConnectingIp = c.req.header("cf-connecting-ip");
	const xRealIp = c.req.header("x-real-ip");
	const xForwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();

	return cfConnectingIp ?? xRealIp ?? xForwardedFor ?? "anonymous";
};

export const createProxyLimiter = (): MiddlewareHandler => {
	return async (c, next) => {
		if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
			writeLog(c, "warn", "rate_limiter_disabled");

			return next();
		}

		// A BYOK header is not validated here — the provider validates the key when
		// the request is forwarded. So presence alone must not bypass the limiter;
		// it only moves the request onto a separate, higher-ceiling IP bucket. Only
		// the requested provider's header counts: any other one would leave the
		// request on the hosted key while granting the higher ceiling.
		const body = await c.req.json<{ provider?: unknown }>().catch(() => null);
		const provider = aiProviderSchema.safeParse(body?.provider);

		const hasPersonalKey =
			provider.success && Boolean(c.req.header(byokHeader(provider.data))?.trim());

		const prefix = hasPersonalKey ? `${RATE_LIMIT_PREFIX}byok:` : RATE_LIMIT_PREFIX;

		const limiter = rateLimiter({
			windowMs: ONE_DAY,
			limit: hasPersonalKey ? BYOK_LIMIT : LIMIT,
			keyGenerator: keyGenerator,
			store: getRedisStore(prefix),
			standardHeaders: "draft-7",
			statusCode: 429,
			message: { error: "Too many requests" },
		});

		return limiter(c, next);
	};
};
