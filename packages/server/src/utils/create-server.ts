import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { chatRoutes } from "@/routes/chat.routes.js";
import { databasesRoutes } from "@/routes/databases.routes.js";
import { queryRoutes } from "@/routes/query.routes.js";
import { recordsRoutes } from "@/routes/records.routes.js";
import { tablesRoutes } from "@/routes/tables.routes.js";
import { websocketRoutes } from "@/routes/websocket.routes.js";

const getCoreDistPath = () => {
	if (process.env.NODE_ENV === "development") {
		return path.resolve(process.cwd(), "../core/dist");
	}

	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(__dirname, "./core-dist");
};

export const createServer = () => {
	const app = new Hono({ strict: false });
	const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({
		app: app as any,
	});

	app.use("/*", cors());

	if (process.env.NODE_ENV === "development") {
		app.use(logger());
	}

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

	app.route("/ws", websocketRoutes(upgradeWebSocket));
	app.route("/databases", databasesRoutes);
	app.route("/tables", tablesRoutes);
	app.route("/records", recordsRoutes);
	app.route("/query", queryRoutes);
	app.route("/chat", chatRoutes);

	app.use("/*", serveStatic({ root: getCoreDistPath() }));

	return { app, injectWebSocket };
};
