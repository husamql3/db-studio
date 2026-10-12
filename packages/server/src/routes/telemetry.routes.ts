import { Elysia } from "elysia";
import { z } from "zod";
import {
	captureInstallationActive,
	getTelemetryConfig,
	resetTelemetryId,
	setTelemetryEnabled,
} from "@/observability.js";

const preferenceSchema = z.object({ enabled: z.boolean() }).strict();

export const telemetryRoutes = new Elysia({ prefix: "/telemetry" })
	.get("/config", ({ headers }) => {
		if (headers["x-db-studio-gpc"] === "1" || headers["sec-gpc"] === "1") {
			setTelemetryEnabled(false);
		}
		captureInstallationActive();
		return { data: getTelemetryConfig() };
	})
	.put("/preference", ({ body, status }) => {
		const parsed = preferenceSchema.safeParse(body);
		if (!parsed.success) return status(400, { error: "Invalid telemetry preference" });
		setTelemetryEnabled(parsed.data.enabled);
		return { data: getTelemetryConfig() };
	})
	.post("/reset", () => ({ data: { installationId: resetTelemetryId() } }));
