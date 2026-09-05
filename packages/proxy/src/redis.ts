import { Redis } from "@upstash/redis/cloudflare";
import type { Context } from "hono";
import { RedisStore } from "hono-rate-limiter";

const redisStores = new Map<string, RedisStore>();

export const getRedisStore = (c: Context, prefix = "rate:proxy:"): RedisStore => {
	const cached = redisStores.get(prefix);
	if (cached) return cached;

	const redis = Redis.fromEnv({
		UPSTASH_REDIS_REST_URL: c.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: c.env.UPSTASH_REDIS_REST_TOKEN,
	});
	const store = new RedisStore({ client: redis, prefix });
	redisStores.set(prefix, store);
	return store;
};

export const getRedis = (c: Context): Redis => {
	return Redis.fromEnv({
		UPSTASH_REDIS_REST_URL: c.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: c.env.UPSTASH_REDIS_REST_TOKEN,
	});
};
