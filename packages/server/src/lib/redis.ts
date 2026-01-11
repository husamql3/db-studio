import { Redis } from "@upstash/redis";
import type { MiddlewareHandler } from "hono";
import { RedisStore, rateLimiter } from "hono-rate-limiter";

const redis = Redis.fromEnv();

export const redisStore = new RedisStore({
	client: redis,
	prefix: "rate:chat:",
});

const createChatLimiter = (windowMs: number, limit: number): MiddlewareHandler =>
	rateLimiter({
		windowMs,
		limit,
		keyGenerator: (c) => {
			// todo: FIX THIS CZ IT IS NOT WORKING
			return (
				c.req.header("x-api-key") ??
				c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
				"anonymous"
			);
		},
		store: redisStore,
		standardHeaders: "draft-7",
		statusCode: 429,
		message: "Too many requests — slow down please ☕",
	});

export const chatLimiters = [
	createChatLimiter(60_000, 8), //  8 req / minute
	createChatLimiter(60 * 60 * 1000, 60), // 60 req / hour
	createChatLimiter(24 * 60 * 60 * 1000, 100), // 100 req / day
];
