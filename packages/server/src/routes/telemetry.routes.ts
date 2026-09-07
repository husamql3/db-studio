import { Hono } from "hono";
import { z } from "zod";
import type { ApiHandler } from "@/app.types.js";
import {
	captureInstallationActive,
	getTelemetryConfig,
	resetTelemetryId,
	setTelemetryEnabled,
} from "@/observability.js";

const preferenceSchema = z.object({ enabled: z.boolean() }).strict();

export const telemetryRoutes = new Hono()
	.basePath("/telemetry")
	.get("/config", async (c): ApiHandler<ReturnType<typeof getTelemetryConfig>> => {
		if (c.req.header("x-db-studio-gpc") === "1" || c.req.header("sec-gpc") === "1") {
			setTelemetryEnabled(false);
		}
		captureInstallationActive();
		return c.json({ data: getTelemetryConfig() }, 200);
	})
	.put(
		"/preference",
		async (c): ApiHandler<ReturnType<typeof getTelemetryConfig>, 200 | 400> => {
			const parsed = preferenceSchema.safeParse(await c.req.json().catch(() => undefined));
			if (!parsed.success) return c.json({ error: "Invalid telemetry preference" }, 400);
			setTelemetryEnabled(parsed.data.enabled);
			return c.json({ data: getTelemetryConfig() }, 200);
		},
	)
	.post(
		"/reset",
		async (c): ApiHandler<{ installationId: string }> =>
			c.json({ data: { installationId: resetTelemetryId() } }, 200),
	);

export type TelemetryRoutes = typeof telemetryRoutes.routes;
