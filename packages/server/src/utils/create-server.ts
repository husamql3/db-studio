import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import {
	type DatabaseTypeSchema,
	databaseTypeParamSchema,
} from "shared/types/database.types.js";
import type { AppType } from "@/app.types.js";
import { handleError } from "@/middlewares/error-handler.js";
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
		 * Base path for the API, /:dbType/...
		 * @param {DatabaseTypeSchema} dbType - The type of database to use
		 */
		.basePath("/:dbType")

		/**
		 * Validate the database type and store it in context
		 * @param {DatabaseTypeSchema} dbType - The type of database to use
		 */
		.use(zValidator("param", databaseTypeParamSchema))
		.use(async (c, next) => {
			// dbType is already validated by zValidator above
			const dbType = c.req.param("dbType") as DatabaseTypeSchema;
			c.set("dbType", dbType);
			await next();
		})

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
		.use(
			process.env.NODE_ENV === "development" ? logger() : (_, next) => next(),
		)

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
			c.header(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS",
			);
			c.header("Access-Control-Allow-Headers", "Content-Type");
			await next();
		})

		/**
		 * Handle errors
		 */
		.onError(handleError)

		/**
		 * Routes
		 */
		.route("/databases", databasesRoutes)
		.route("/tables", tablesRoutes)
		.route("/records", recordsRoutes)
		.route("/query", queryRoutes)
		.route("/chat", chatRoutes)

		/**
		 * Serve the static files
		 */
		.use("/*", serveStatic({ root: getCoreDistPath() }));

	return { app };
};

export type { AppType };
