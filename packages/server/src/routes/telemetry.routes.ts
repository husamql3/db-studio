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
	.put(
		"/preference",
		({ body }) => {
			setTelemetryEnabled(body.enabled);

			return { data: getTelemetryConfig() };
		},
		{ body: preferenceSchema },
	)
	.post("/reset", () => ({ data: { installationId: resetTelemetryId() } }));
