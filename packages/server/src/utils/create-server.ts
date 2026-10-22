import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";
import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { Elysia } from "elysia";
import { adapterRegistry } from "@/adapters/adapter.registry.js";
import { registerAdapters } from "@/adapters/register.js";
import { HTTPException } from "@/http-exception.js";
import { handleError } from "@/middlewares/error-handler.js";
import {
	captureServerEvent,
	databaseTypeForRequest,
	durationBucket,
	operationForRequest,
	outcomeForStatus,
	startServerSpan,
} from "@/observability.js";
import {
	currentRequestId,
	resolveRequestId,
	runWithRequestContext,
} from "@/operational-log.js";
import { chatRoutes } from "@/routes/chat.routes.js";
import { connectionsRoutes } from "@/routes/connections.routes.js";
import { databasesRoutes } from "@/routes/databases.routes.js";
import { keysRoutes } from "@/routes/keys.routes.js";
import { logsRoutes } from "@/routes/logs.routes.js";
import { queryRoutes } from "@/routes/query.routes.js";
import { recordsRoutes } from "@/routes/records.routes.js";
import { tablesRoutes } from "@/routes/tables.routes.js";
import { telemetryRoutes } from "@/routes/telemetry.routes.js";

const { API_PREFIX } = DEFAULTS;

/**
 * Get the path to the web app distribution directory.
 */
const getWebDistPath = () => {
	if (process.env.NODE_ENV === "development") {
		return path.resolve(process.cwd(), "../web/dist");
	}

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const bundledWebDistPath = path.resolve(__dirname, "./web-dist");
	const localWebDistPath = path.resolve(process.cwd(), "../web/dist");

	const bundledIndexPath = path.resolve(bundledWebDistPath, "index.html");
	const localIndexPath = path.resolve(localWebDistPath, "index.html");

	if (!existsSync(bundledIndexPath) && existsSync(localIndexPath)) {
		return localWebDistPath;
	}

	return bundledWebDistPath;
};

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".ttf": "font/ttf",
	".woff2": "font/woff2",
};

/**
 * Serves a file from the web build, or index.html for anything that is not one, so a refresh on
 * a client route like `/table/:name` loads the SPA. Paths that escape the build directory get
 * index.html too.
 *
 * Vite names every file in assets/ after a hash of its content, so the browser may keep those
 * for good and reuse its compiled code; anything else, index.html above all, is revalidated.
 */
const serveWebFile = async (webDist: string, pathname: string): Promise<Response> => {
	let filePath = path.join(webDist, "index.html");
	try {
		const requested = path.resolve(webDist, `.${decodeURIComponent(pathname)}`);
		if (requested.startsWith(`${webDist}${path.sep}`) && (await stat(requested)).isFile()) {
			filePath = requested;
		}
	} catch {}
	const file = await readFile(filePath).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	// A checkout whose web app was never built has no index.html.
	if (file === null) {
		return new Response(
			'The web app is not built. Run "bun run build" in the repository root, then restart db-studio.',
			{ status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
		);
	}
	const hashed = filePath.startsWith(path.join(webDist, "assets", path.sep));
	return new Response(file, {
		headers: {
			"Content-Type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
			"Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
		},
	});
};

/**
 * Same-origin by default: the SPA is served from the same origin as the API, so no cross-origin
 * access is needed. Refusing every other origin prevents drive-by-localhost attacks (any other
 * browser tab issuing cross-origin reads/edits/drops against the user's DB).
 *
 * Deployments that genuinely need cross-origin access (e.g. a hosted fork serving the SPA from a
 * different origin) set `ALLOWED_ORIGINS` to a comma-separated list of explicit origins. Never `*`.
 */
const isAllowedOrigin = (origin: string | null): boolean => {
	if (!origin) return false;
	const allowed =
		process.env.ALLOWED_ORIGINS?.split(",")
			.map((o) => o.trim())
			.filter(Boolean) ?? [];
	if (allowed.includes(origin)) return true;
	if (process.env.NODE_ENV !== "development") return false;
	try {
		const { hostname } = new URL(origin);
		return (
			hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1"
		);
	} catch {
		return false;
	}
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The server holds saved database passwords. A web page can still reach it through DNS
 * rebinding (its own domain resolving to 127.0.0.1), so a request must name an allowed host in
 * its `Host` header, whatever address the server listens on. Loopback hosts are always allowed.
 * To serve db-studio under another name (a LAN host, a reverse proxy), set `ALLOWED_HOSTS` to a
 * comma-separated list of extra hostnames: no ports, no wildcards.
 */
const isAllowedHost = (hostHeader: string): boolean => {
	const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
	if (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost")) return true;
	const allowed =
		process.env.ALLOWED_HOSTS?.split(",")
			.map((h) => h.trim().toLowerCase())
			.filter(Boolean) ?? [];
	return allowed.includes(hostname);
};

/**
 * Gives every request one ID, reused from the caller when it sent one, so the browser, this
 * server's logs and error reports, and the AI proxy all name the same request. API requests also
 * get a tracing span and a `server_operation` event.
 */
const trackRequest = (
	request: Request,
	respond: () => Promise<Response>,
): Promise<Response> => {
	const { pathname } = new URL(request.url);
	const operation = operationForRequest(request.method, pathname);
	const dbType = databaseTypeForRequest(pathname);
	const context = {
		requestId: resolveRequestId(request.headers.get("x-request-id") ?? undefined),
		operation,
		dbType,
	};
	return runWithRequestContext(context, async () => {
		if (
			!pathname.startsWith(`${API_PREFIX}/`) ||
			pathname.startsWith(`${API_PREFIX}/telemetry`)
		) {
			return respond();
		}
		const startedAt = performance.now();
		const registeredType = dbType && adapterRegistry.has(dbType) ? dbType : undefined;
		const response = await startServerSpan(operation, registeredType, respond);
		captureServerEvent({
			event: "server_operation",
			properties: {
				operation,
				method: request.method,
				outcome: outcomeForStatus(response.status),
				duration_bucket: durationBucket(performance.now() - startedAt),
				db_type: registeredType,
			},
		});
		return response;
	});
};

export const createServer = () => {
	registerAdapters();
	const webDist = getWebDistPath();

	const app = new Elysia({ adapter: node() })
		.wrap(
			(handle, request) =>
				(...args: unknown[]) =>
					trackRequest(request, async () => (await handle(...args)) as unknown as Response),
		)
		.onRequest(({ request, set }) => {
			set.headers["x-request-id"] = currentRequestId();
			if (!isAllowedHost(request.headers.get("host") ?? new URL(request.url).host)) {
				throw new HTTPException(403, { message: "Host not allowed" });
			}
		})
		.use(
			cors({
				origin: (request) => isAllowedOrigin(request.headers.get("origin")),
				methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
				allowedHeaders: [
					"Content-Type",
					"X-Run-Id",
					"X-Request-Id",
					"X-Connection-Id",
					"X-DB-Studio-GPC",
					"x-byok-gemini",
					"x-byok-openai",
					"x-byok-anthropic",
					"x-byok-grok",
					"x-byok-openrouter",
				],
				exposeHeaders: ["X-Request-Id"],
				credentials: false,
				maxAge: 600,
			}),
		)
		/**
		 * Validate query strings as sent: for Zod schemas Elysia JSON-parses values that look like
		 * `[...]` or `{...}` and splits any value containing a comma, so `filters=[...]` or a search
		 * for `a,b` would fail validation.
		 *
		 * Accept only JSON bodies. Form and text bodies are CORS "simple requests" that any website
		 * can send without a preflight, which would let a page run SQL against a local db-studio.
		 */
		.onTransform((context) => {
			context.query = Object.fromEntries(new URL(context.request.url).searchParams);
			const contentType = context.request.headers.get("content-type") ?? "";
			if (context.body !== undefined && !/^application\/([\w.-]+\+)?json/.test(contentType)) {
				throw new HTTPException(400, { message: "Request body must be JSON" });
			}
		})
		.onError(({ error, request }) => handleError(error, request))

		/**
		 * API routes are namespaced under API_PREFIX so they never collide with client-side (SPA)
		 * routes served from the same origin. A refresh on a client route like `/table/:name` must
		 * fall through to index.html, not be interpreted as a `/:dbType/...` API request.
		 * See db-studio#214.
		 */
		.group(API_PREFIX, (api) =>
			api
				.use(connectionsRoutes)
				.use(databasesRoutes)
				.use(chatRoutes)
				.use(telemetryRoutes)
				.group("/:dbType", (scoped) =>
					scoped
						.use(tablesRoutes)
						.use(recordsRoutes)
						.use(queryRoutes)
						.use(keysRoutes)
						.use(logsRoutes),
				),
		);

	if (process.env.NODE_ENV !== "test") {
		/**
		 * Unmatched API paths answer with JSON so API clients never receive the SPA's index.html;
		 * every other GET serves the web build.
		 */
		app.all("/*", ({ request, path: pathname }) =>
			(request.method === "GET" || request.method === "HEAD") &&
			!pathname.startsWith(`${API_PREFIX}/`)
				? serveWebFile(webDist, pathname)
				: Response.json({ error: "Not found" }, { status: 404 }),
		);
	}

	return { app };
};
