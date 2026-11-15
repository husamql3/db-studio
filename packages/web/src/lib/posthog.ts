import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import type { PostHog } from "posthog-js";
import type { SectionId } from "@/lib/sections";
import { fetchTelemetryConfig, type TelemetryConfig } from "@/shared/api";

const OFFICIAL_POSTHOG_KEY = "phc_nxaQk54MWAehmL72J4gjVbrQCpbSTedMyHn3PvFxAhkd";

type AnalyticsEvent =
	| { event: "db_connected"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "db_selected"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "query_executed"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "record_created"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "record_updated"; properties: { db_type: DatabaseTypeSchema } }
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
			properties: { page: SectionId | "home" | "connect" };
	  };

let config: TelemetryConfig | undefined;

/** The PostHog client, loaded the first time telemetry turns out to be enabled. */
let posthog: PostHog | undefined;
let initialized = false;

const globalPrivacyControlEnabled = () =>
	(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

export const getTelemetryConfig = (): TelemetryConfig | undefined => config;

export const initPosthog = async (): Promise<TelemetryConfig | undefined> => {
	try {
		config = (await fetchTelemetryConfig(globalPrivacyControlEnabled())).data.data;
	} catch {
		return undefined;
	}

	const key = import.meta.env.VITE_POSTHOG_KEY ?? OFFICIAL_POSTHOG_KEY;

	if (!config?.enabled || !key) return config;

	posthog ??= (await import("posthog-js")).default;

	// A second call (React's development double effect) finishes after the first one's import.
	if (initialized) return config;

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

	return config;
};

export const posthogAnalytics = {
	capture<E extends AnalyticsEvent["event"]>(
		event: E,
		properties: Extract<AnalyticsEvent, { event: E }>["properties"],
	): void {
		if (!initialized || !config?.enabled) return;
		posthog?.capture(event, {
			...properties,
			source: "client",
			app_version: config.appVersion,
			$geoip_disable: false,
		});
	},
};
