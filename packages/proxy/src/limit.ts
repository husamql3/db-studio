import type { MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { redisStore } from "./redis";

export const createProxyLimiter = (windowMs: number, limit: number): MiddlewareHandler => {
  return rateLimiter({
    windowMs,
    limit,
    keyGenerator: (c) => {
      const cfConnectingIp = c.req.header("cf-connecting-ip");
      const xRealIp = c.req.header("x-real-ip");
      const xForwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      const apiKey = c.req.header("x-api-key");

      const identifier = apiKey ?? cfConnectingIp ?? xRealIp ?? xForwardedFor ?? "anonymous";
      console.log("Rate limit key:", identifier);

      return identifier;
    },
    store: redisStore,
    standardHeaders: "draft-7",
    statusCode: 429,
    message: "Too many requests",
  });
}