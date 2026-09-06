import { type AdminFilters, getAdminOverview } from "./analytics";
import {
	clearAdminSessionCookie,
	createAdminSessionCookie,
	hasValidAdminSession,
	verifyAdminPassword,
} from "./auth";

type AdminEnv = Env & {
	ADMIN_PASSWORD_HASH?: string;
	ADMIN_SESSION_SECRET?: string;
	POSTHOG_PERSONAL_API_KEY?: string;
	POSTHOG_PROJECT_ID?: string;
	POSTHOG_HOST?: string;
	SENTRY_AUTH_TOKEN?: string;
	SENTRY_ORG?: string;
	SENTRY_HOST?: string;
};

const attempts = new Map<string, { count: number; resetAt: number }>();

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
	Response.json(body, {
		status,
		headers: { "cache-control": "private, no-store", ...headers },
	});

const attemptKey = async (request: Request): Promise<string> => {
	const ip = request.headers.get("cf-connecting-ip") ?? "local";
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
	return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const rateLimited = async (request: Request): Promise<boolean> => {
	const key = await attemptKey(request);
	const now = Date.now();
	const current = attempts.get(key);
	if (!current || current.resetAt <= now) {
		attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
		return false;
	}
	current.count += 1;
	return current.count > 8;
};

/** Only failed attempts should burn the budget, so a success clears it. */
const clearAttempts = async (request: Request): Promise<void> => {
	attempts.delete(await attemptKey(request));
};

export const handleAdminApi = async (
	request: Request,
	env: AdminEnv,
): Promise<Response | null> => {
	const url = new URL(request.url);
	if (!url.pathname.startsWith("/api/admin/")) return null;

	if (url.pathname === "/api/admin/login" && request.method === "POST") {
		if (
			Number(request.headers.get("content-length") ?? 0) > 4_096 ||
			(await rateLimited(request))
		) {
			return json({ error: "Too many attempts" }, 429);
		}
		const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
		if (typeof body?.password !== "string" || body.password.length > 256) {
			return json({ error: "Invalid password" }, 400);
		}
		if (!(await verifyAdminPassword(body.password, env))) {
			return json({ error: "Invalid password" }, 401);
		}
		const cookie = await createAdminSessionCookie(env);
		if (!cookie) return json({ error: "Admin authentication is not configured" }, 503);
		await clearAttempts(request);
		return json({ ok: true }, 200, { "set-cookie": cookie });
	}

	if (url.pathname === "/api/admin/logout" && request.method === "POST") {
		return json({ ok: true }, 200, { "set-cookie": clearAdminSessionCookie });
	}

	if (!(await hasValidAdminSession(request, env))) return json({ error: "Unauthorized" }, 401);

	if (url.pathname === "/api/admin/overview" && request.method === "GET") {
		const rawRange = Number(url.searchParams.get("range") ?? 30);
		const range = rawRange === 7 || rawRange === 90 ? rawRange : 30;
		const allowedSources = ["client", "server"] as const;
		const allowedEngines = ["pg", "mysql", "mssql", "mongodb", "sqlite", "redis"] as const;
		const allowedFeatures = [
			"db_connected",
			"db_selected",
			"query_executed",
			"record_created",
			"record_deleted",
			"record_exported",
			"table_created",
			"column_added",
			"bulk_insert",
			"chat_opened",
			"table_viewed",
		] as const;
		const source = allowedSources.find((value) => value === url.searchParams.get("source"));
		const engine = allowedEngines.find((value) => value === url.searchParams.get("engine"));
		const feature = allowedFeatures.find((value) => value === url.searchParams.get("feature"));
		const rawRelease = url.searchParams.get("release") ?? undefined;
		const release =
			rawRelease && /^[a-zA-Z0-9._@-]{1,64}$/.test(rawRelease) ? rawRelease : undefined;
		const filters: AdminFilters = { source, engine, feature, release };
		const filterKey = [source, engine, feature, release]
			.map((value) => value ?? "all")
			.join(":");
		const cacheKey = new Request(
			`${url.origin}/api/admin/cache/overview?range=${range}&filters=${encodeURIComponent(filterKey)}`,
		);
		const cache = typeof caches === "undefined" ? undefined : caches.default;
		const cached = await cache?.match(cacheKey);
		if (cached) return json(await cached.json());
		const overview = await getAdminOverview(env, range, filters);
		await cache?.put(
			cacheKey,
			Response.json(overview, { headers: { "cache-control": "public, max-age=300" } }),
		);
		return json(overview);
	}

	return json({ error: "Not found" }, 404);
};
