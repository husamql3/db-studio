import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "@db-studio/shared/constants";
import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { z } from "zod";
import { adapterRegistry } from "@/adapters/adapter.registry.js";
import { registerAdapters } from "@/adapters/register.js";
import type { AppType } from "@/app.types.js";
import { handleError } from "@/middlewares/error-handler.js";
import { chatRoutes } from "@/routes/chat.routes.js";
import { databasesRoutes } from "@/routes/databases.routes.js";
import { keysRoutes } from "@/routes/keys.routes.js";
import { queryRoutes } from "@/routes/query.routes.js";
import { recordsRoutes } from "@/routes/records.routes.js";
import { tablesRoutes } from "@/routes/tables.routes.js";

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

const databaseTypeParamSchema = z.object({
	dbType: z
		.string()
		.refine(
			(type): type is DatabaseTypeSchema =>
				adapterRegistry.getSupportedTypes().includes(type as DatabaseTypeSchema),
			{
				message: `Invalid database type. Supported types: ${adapterRegistry
					.getSupportedTypes()
					.join(", ")}`,
			},
		),
});

export const createServer = () => {
	registerAdapters();

	const app = new Hono<AppType>({ strict: false })
		/**
		 * Enable CORS.
		 *
		 * Same-origin by default: the SPA is served from the same origin as the
		 * API, so no cross-origin access is needed. An empty allowlist means no
		 * allow-origin header is emitted for cross-origin requests, which
		 * prevents drive-by-localhost attacks (any other browser tab issuing
		 * cross-origin reads/edits/drops against the user's DB).
		 *
		 * Deployments that genuinely need cross-origin access (e.g. a hosted
		 * fork serving the SPA from a different origin) set `ALLOWED_ORIGINS` to
		 * a comma-separated list of explicit origins. Never `*`.
		 */
		.use(
			"/*",
			cors({
				origin: process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [],
				allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowHeaders: ["Content-Type", "x-byok-gemini"],
			}),
		)

		/**
		 * Pretty print the JSON response
		 */
		.use(prettyJSON({ space: 2 }))

		/**
		 * Enable logger in development mode
		 */
		.use(process.env.NODE_ENV === "development" ? logger() : (_, next) => next())

		/**
		 * Serve the favicon.ico file
		 */
		.use(
			"/favicon.ico",
			serveStatic({
				path: path.resolve(getWebDistPath(), "favicon.ico"),
			}),
		)

		/**
		 * Handle errors
		 */
		.onError(handleError)

		/**
		 * API routes are namespaced under API_PREFIX so they never collide with
		 * client-side (SPA) routes served from the same origin. A refresh on a
		 * client route like `/table/:name` must fall through to index.html, not
		 * be interpreted as a `/:dbType/...` API request. See db-studio#214.
		 *
		 * Database routes - available at the API root (no dbType required)
		 */
		.route(API_PREFIX, databasesRoutes)
		.route(API_PREFIX, chatRoutes)

		/**
		 * Serve static assets (SPA-owned; live at the root, not under the API prefix)
		 */
		.use("/assets/*", serveStatic({ root: getWebDistPath() }))
		.use("/image.png", serveStatic({ root: getWebDistPath() }))

		/**
		 * Routes that require dbType validation - under API_PREFIX/:dbType/...
		 */
		.use(
			`${API_PREFIX}/:dbType/*`,
			zValidator("param", databaseTypeParamSchema, (result, c) => {
				if (!result.success) {
					const rawType = c.req.param("dbType");
					throw new HTTPException(400, {
						message: `Invalid database type: "${rawType}". Supported types: ${adapterRegistry.getSupportedTypes().join(", ")}`,
					});
				}
			}),
			async (c, next) => {
				const { dbType } = c.req.valid("param");
				c.set("dbType", dbType);
				await next();
			},
		)
		.route(`${API_PREFIX}/:dbType`, tablesRoutes)
		.route(`${API_PREFIX}/:dbType`, recordsRoutes)
		.route(`${API_PREFIX}/:dbType`, queryRoutes)
		.route(`${API_PREFIX}/:dbType`, keysRoutes);

	if (process.env.NODE_ENV !== "test") {
		/**
		 * Any unmatched API path is a genuine 404 - respond with JSON so API
		 * clients never receive the SPA's index.html HTML by mistake.
		 */
		app.all(`${API_PREFIX}/*`, (c) => c.json({ error: "Not found" }, 404));

		/**
		 * SPA fallback - every non-API path serves the client app so that
		 * deep-link refreshes (e.g. /table/:name) load index.html.
		 */
		app.use("/*", serveStatic({ root: getWebDistPath() }));
		app.get("/*", serveStatic({ path: path.resolve(getWebDistPath(), "index.html") }));
	}

	return { app };
};

export type { AppType };

// Export the app type for hc client
export type AppRoutes = ReturnType<typeof createServer>["app"];
