import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import posthog from "posthog-js";

const OFFICIAL_POSTHOG_KEY = "phc_nxaQk54MWAehmL72J4gjVbrQCpbSTedMyHn3PvFxAhkd";

type AnalyticsEvent =
	| { event: "db_connected"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "db_selected"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "query_executed"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "record_created"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "record_deleted"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "record_exported"; properties: { db_type: DatabaseTypeSchema; format: string } }
	| { event: "table_created"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "column_added"; properties: { db_type: DatabaseTypeSchema } }
	| {
			event: "bulk_insert";
			properties: { db_type: DatabaseTypeSchema; format: "csv" | "json" | "excel" };
	  }
	| { event: "chat_opened"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "table_viewed"; properties: { db_type: DatabaseTypeSchema } }
	| {
			event: "connection_error";
			properties: { db_type: DatabaseTypeSchema; status_bucket: "4xx" | "5xx" | "network" };
	  }
	| {
			event: "page_viewed";
			properties: {
				page:
					| "home"
					| "browser"
					| "table"
					| "schema"
					| "runner"
					| "visualizer"
					| "logs"
					| "indexes";
			};
	  };

export type TelemetryConfig = {
	enabled: boolean;
	installationId: string;
	appVersion: string;
};

let config: TelemetryConfig | undefined;
let initialized = false;
let everInitialized = false;

const globalPrivacyControlEnabled = () =>
	(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

export const getTelemetryConfig = (): TelemetryConfig | undefined => config;

export const initPosthog = async (): Promise<TelemetryConfig | undefined> => {
	try {
		const response = await fetch("/api/telemetry/config", {
			headers: globalPrivacyControlEnabled() ? { "x-db-studio-gpc": "1" } : undefined,
		});
		const body = (await response.json()) as { data?: TelemetryConfig };
		config = body.data;
	} catch {
		return undefined;
	}

	const key = import.meta.env.VITE_POSTHOG_KEY ?? OFFICIAL_POSTHOG_KEY;
	if (!config?.enabled || !key) return config;
	if (initialized) return config;
	if (everInitialized) {
		posthog.opt_in_capturing();
		posthog.identify(config.installationId);
		initialized = true;
		return config;
	}

	posthog.init(key, {
		api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com",
		person_profiles: "identified_only",
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: false,
		disable_session_recording: true,
		persistence: "memory",
		loaded(client) {
			if (config) client.identify(config.installationId);
		},
	});
	initialized = true;
	everInitialized = true;
	return config;
};

export const setTelemetryPreference = async (enabled: boolean): Promise<TelemetryConfig> => {
	const response = await fetch("/api/telemetry/preference", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ enabled }),
	});
	if (!response.ok) throw new Error("Could not update telemetry preference");
	const body = (await response.json()) as { data: TelemetryConfig };
	config = body.data;
	if (!enabled) {
		posthog.opt_out_capturing();
		initialized = false;
	} else if (!globalPrivacyControlEnabled()) {
		await initPosthog();
	}
	return body.data;
};

export const resetTelemetryIdentifier = async (): Promise<void> => {
	const response = await fetch("/api/telemetry/reset", { method: "POST" });
	if (!response.ok) throw new Error("Could not reset analytics identifier");
	const body = (await response.json()) as { data: { installationId: string } };
	if (config) config = { ...config, installationId: body.data.installationId };
	if (initialized) {
		posthog.reset();
		posthog.identify(body.data.installationId);
	}
};

export const posthogAnalytics = {
	capture<E extends AnalyticsEvent["event"]>(
		event: E,
		properties: Extract<AnalyticsEvent, { event: E }>["properties"],
	): void {
		if (!initialized || !config?.enabled) return;
		posthog.capture(event, {
			...properties,
			source: "client",
			app_version: config.appVersion,
			$geoip_disable: false,
		});
	},
};
