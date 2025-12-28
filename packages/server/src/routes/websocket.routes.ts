import type { NodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { db } from "../db.js";

const checkDatabaseConnection = async (): Promise<{
	success: boolean;
	error?: string;
}> => {
	const client = await db.connect();
	try {
		await client.query("SELECT 1");
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	} finally {
		client.release();
	}
};

const DB_CHECK_INTERVAL = 5000;
const DB_CHECK_TIMEOUT = 10000;

export const websocketRoutes = (upgradeWebSocket: NodeWebSocket["upgradeWebSocket"]) => {
	const app = new Hono();

	app.get(
		"/",
		upgradeWebSocket(() => {
			let interval: NodeJS.Timeout;

			return {
				onOpen: async (_event, ws) => {
					console.log("WebSocket client connected");

					// Send initial status
					try {
						const status = await checkDatabaseConnection();
						ws.send(
							JSON.stringify({
								...status,
								status: status.success ? "connected" : "failed",
								timestamp: new Date().toISOString(),
							}),
						);
					} catch (err) {
						console.error("Error checking DB on open:", err);
						ws.send(
							JSON.stringify({
								success: false,
								status: "failed",
								error: "Initial check failed",
								timestamp: new Date().toISOString(),
							}),
						);
					}

					// Check DB status every 5 seconds
					interval = setInterval(async () => {
						try {
							const status = await Promise.race([
								checkDatabaseConnection(),
								new Promise<{ success: boolean; error: string }>((_, reject) =>
									setTimeout(
										() => reject({ success: false, error: "Database check timeout" }),
										DB_CHECK_TIMEOUT,
									),
								),
							]);
							ws.send(
								JSON.stringify({
									...status,
									status: status.success ? "connected" : "failed",
									timestamp: new Date().toISOString(),
								}),
							);
						} catch (err) {
							console.error("Error in DB check interval:", err);
							ws.send(
								JSON.stringify({
									success: false,
									status: "failed",
									error: err instanceof Error ? err.message : "Check failed",
									timestamp: new Date().toISOString(),
								}),
							);
						}
					}, DB_CHECK_INTERVAL);
				},
				onMessage(event, _ws) {
					console.log(`Message from client: ${event.data}`);
				},
				onClose: () => {
					console.log("WebSocket connection closed");
					if (interval) {
						clearInterval(interval);
					}
				},
				onError: (err) => {
					console.error("WebSocket error:", err);
					if (interval) {
						clearInterval(interval);
					}
				},
			};
		}),
	);

	return app;
};
