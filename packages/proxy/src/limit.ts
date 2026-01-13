import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { getRedisStore } from "./redis";

export const ONE_DAY = 24 * 60 * 60 * 1000;
export const LIMIT = 5;

export const keyGenerator = (c: Context) => {
  const cfConnectingIp = c.req.header("cf-connecting-ip");
  const xRealIp = c.req.header("x-real-ip");
  const xForwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const apiKey = c.req.header("x-api-key");

  const identifier = apiKey ?? cfConnectingIp ?? xRealIp ?? xForwardedFor ?? "anonymous";
  return identifier;
}

export const createProxyLimiter = (): MiddlewareHandler => {
  return async (c, next) => {
    const store = getRedisStore(c);
    const limiter = rateLimiter({
      windowMs: ONE_DAY,
      limit: LIMIT,
      keyGenerator: keyGenerator,
      store: store,
      standardHeaders: "draft-7",
      statusCode: 429,
      message: "Too many requests",
    });
    return limiter(c, next);
  };
}
