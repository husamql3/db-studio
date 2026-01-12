import { Redis } from "@upstash/redis/cloudflare";
import { env } from "cloudflare:workers";
import { RedisStore } from "hono-rate-limiter";

const redis = Redis.fromEnv({
	UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
	UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
});

export const redisStore = new RedisStore({
	client: redis,
	prefix: "rate:proxy:",
});

