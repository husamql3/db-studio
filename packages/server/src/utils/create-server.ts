import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { type DatabaseTypeSchema, databaseTypeParamSchema } from "shared/types";
import type { AppType } from "@/app.types.js";
import { handleError, validationHook } from "@/middlewares/error-handler.js";
import { chatRoutes } from "@/routes/chat.routes.js";
import { databasesRoutes } from "@/routes/databases.routes.js";
import { queryRoutes } from "@/routes/query.routes.js";
import { recordsRoutes } from "@/routes/records.routes.js";
import { tablesRoutes } from "@/routes/tables.routes.js";

/**
 * Get the path to the core distribution directory.
 */
const getCoreDistPath = () => {
	if (process.env.NODE_ENV === "development") {
		return path.resolve(process.cwd(), "../core/dist");
	}

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(__dirname, "./core-dist");
};

export const createServer = () => {
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
				path: path.resolve(getCoreDistPath(), "favicon.ico"),
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

		/**
		 * Serve static assets (before dbType validation to avoid conflicts)
		 */
		.use("/assets/*", serveStatic({ root: getCoreDistPath() }))
		.use("/image.png", serveStatic({ root: getCoreDistPath() }))

		/**
		 * Routes that require dbType validation - under /:dbType/...
		 */
		.use("/:dbType/*", zValidator("param", databaseTypeParamSchema, validationHook))
		.use("/:dbType/*", async (c, next) => {
			const dbType = c.req.param("dbType") as DatabaseTypeSchema;
			c.set("dbType", dbType);
			await next();
		})
		.route("/:dbType", tablesRoutes)
		.route("/:dbType", recordsRoutes)
		.route("/:dbType", queryRoutes)
		.route("/:dbType", chatRoutes)

		/**
		 * Serve all other static files as fallback (for SPA)
		 */
		.use("/*", serveStatic({ root: getCoreDistPath() }));

	return { app };
};

export type { AppType };

// Export the app type for hc client
export type AppRoutes = ReturnType<typeof createServer>["app"];
