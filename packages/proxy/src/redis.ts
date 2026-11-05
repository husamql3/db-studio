import { Redis } from "@upstash/redis/cloudflare";
import { env } from "cloudflare:workers";
import { RedisStore } from "hono-rate-limiter";

export const RATE_LIMIT_PREFIX = "rate:proxy:";

let redis: Redis | undefined;
const redisStores = new Map<string, RedisStore>();

export const getRedis = (): Redis =>
	(redis ??= new Redis({
		url: env.UPSTASH_REDIS_REST_URL,
		token: env.UPSTASH_REDIS_REST_TOKEN,
	}));

export const getRedisStore = (prefix: string): RedisStore => {
	let store = redisStores.get(prefix);

	if (!store) {
		store = new RedisStore({ client: getRedis(), prefix });
		redisStores.set(prefix, store);
	}

	return store;
};
