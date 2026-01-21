import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import type { AppType } from "@/app.types.js";
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
	const app = new Hono<AppType>({ strict: false });

	if (process.env.NODE_ENV === "development") {
		app.use(logger());
	}

	app.use("/*", cors());

	app.use(
		"/favicon.ico",
		serveStatic({
			path: path.resolve(getCoreDistPath(), "favicon.ico"),
		}),
	);

	app.use("*", async (c, next) => {
		c.header("Access-Control-Allow-Origin", "*");
		c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
		c.header("Access-Control-Allow-Headers", "Content-Type");
		await next();
	});

	app.onError((e, c) => {
		console.error("Server error:", e);
		if (e instanceof HTTPException) {
			return e.getResponse();
		}

		if (e instanceof ZodError) {
			return c.json(
				{
					error: e.message,
				},
				400,
			);
		}

		return c.json(
			{
				error: e instanceof Error ? e.message : "Internal server error",
			},
			500,
		);
	});

	app.route("/databases", databasesRoutes);
	app.route("/tables", tablesRoutes);
	app.route("/records", recordsRoutes);
	app.route("/query", queryRoutes);
	app.route("/chat", chatRoutes);

	app.use("/*", serveStatic({ root: getCoreDistPath() }));

	return { app };
};

export type { AppType };
