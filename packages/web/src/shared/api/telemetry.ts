import { rootApi } from "./client";

export type TelemetryConfig = {
	enabled: boolean;
	installationId: string;
	appVersion: string;
};

/** `globalPrivacyControl` makes the server turn telemetry off before it answers. */
export const fetchTelemetryConfig = (globalPrivacyControl: boolean) =>
	rootApi.get<{ data?: TelemetryConfig }>("/telemetry/config", {
		headers: globalPrivacyControl ? { "x-db-studio-gpc": "1" } : undefined,
	});
