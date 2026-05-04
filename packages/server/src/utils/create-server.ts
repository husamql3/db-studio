import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { queryRoutes } from "@/routes/query.routes.js";
import { recordsRoutes } from "@/routes/records.routes.js";
import { tablesRoutes } from "@/routes/tables.routes.js";

/**
 * Get the path to the web app distribution directory.
 */
const getWebDistPath = () => {
	if (process.env.NODE_ENV === "development") {
		return path.resolve(process.cwd(), "../web/dist");
	}

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(__dirname, "./web-dist");
};

const databaseTypeParamSchema = z.object({
	dbType: z.string().refine(
		(type): type is DatabaseTypeSchema =>
			adapterRegistry.getSupportedTypes().includes(type as DatabaseTypeSchema),
		() => ({
			message: `Invalid database type. Supported types: ${adapterRegistry
				.getSupportedTypes()
				.join(", ")}`,
		}),
	),
});

export const createServer = () => {
	registerAdapters();

	const app = new Hono<AppType>({ strict: false })
		/**
		 * Enable CORS
		 */
		.use("/*", cors())

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
		 * Handle CORS requests
		 */
		.use("*", async (c, next) => {
			c.header("Access-Control-Allow-Origin", "*");
			c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
			c.header("Access-Control-Allow-Headers", "Content-Type");
			await next();
		})

		/**
		 * Handle errors
		 */
		.onError(handleError)

		/**
		 * Database routes - available at root level (no dbType required)
		 */
		.route("/", databasesRoutes)
		.route("/", chatRoutes)

		/**
		 * Serve static assets (before dbType validation to avoid conflicts)
		 */
		.use("/assets/*", serveStatic({ root: getWebDistPath() }))
		.use("/image.png", serveStatic({ root: getWebDistPath() }))

		/**
		 * Routes that require dbType validation - under /:dbType/...
		 */
		.use(
			"/:dbType/*",
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
		.route("/:dbType", tablesRoutes)
		.route("/:dbType", recordsRoutes)
		.route("/:dbType", queryRoutes)

		/**
		 * Serve all other static files as fallback (for SPA)
		 */
		.use("/*", serveStatic({ root: getWebDistPath() }));

	return { app };
};

export type { AppType };

// Export the app type for hc client
export type AppRoutes = ReturnType<typeof createServer>["app"];
