import { Redis } from "@upstash/redis/cloudflare";
import type { Context } from "hono";
import { RedisStore } from "hono-rate-limiter";

let redisStore: RedisStore | null = null;

export const getRedisStore = (c: Context): RedisStore => {
	if (!redisStore) {
		const redis = Redis.fromEnv({
			UPSTASH_REDIS_REST_URL: c.env.UPSTASH_REDIS_REST_URL,
			UPSTASH_REDIS_REST_TOKEN: c.env.UPSTASH_REDIS_REST_TOKEN,
		});
		redisStore = new RedisStore({
			client: redis,
			prefix: "rate:proxy:",
		});
	}
	return redisStore;
};

export const getRedis = (c: Context): Redis => {
	return Redis.fromEnv({
		UPSTASH_REDIS_REST_URL: c.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: c.env.UPSTASH_REDIS_REST_TOKEN,
	});
};
