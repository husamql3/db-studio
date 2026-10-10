import type { Context, MiddlewareHandler } from "hono";

export type ProxyEnv = {
	Bindings: CloudflareBindings;
	Variables: { requestId: string };
};

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Reuse the ID the db-studio server sent so one request reads the same in both
 * logs; a direct caller falls back to Cloudflare's own ray ID.
 */
export const requestId: MiddlewareHandler<ProxyEnv> = async (c, next) => {
	const incoming = c.req.header("x-request-id");
	const id =
		incoming && REQUEST_ID.test(incoming)
			? incoming
			: (c.req.header("cf-ray") ?? crypto.randomUUID());
	c.set("requestId", id);
	await next();
	c.header("x-request-id", id);
};

export const errorType = (error: unknown): string =>
	error instanceof Error ? error.name : "UnknownError";

/** Logged as an object so Workers Logs indexes each field for filtering. */
export const writeLog = (
	c: Context<ProxyEnv>,
	level: "warn" | "error",
	event: string,
	fields: Record<string, string | undefined> = {},
): void => {
	console[level]({
		event,
		request_id: c.get("requestId"),
		path: c.req.path,
		...fields,
	});
};
