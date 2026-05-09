import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import posthog from "posthog-js";

type AnalyticsEvent =
	| { event: "db_connected"; properties: { db_type: DatabaseTypeSchema } }
	| { event: "db_selected"; properties: { db_type: DatabaseTypeSchema; database: string } }
	| { event: "query_executed"; properties: { db_type: string } }
	| { event: "record_created"; properties: { db_type: string } }
	| { event: "record_deleted"; properties: { db_type: string } }
	| { event: "record_exported"; properties: { db_type: string; format: string } }
	| { event: "table_created"; properties: { db_type: string } }
	| { event: "column_added"; properties: { db_type: string } }
	| { event: "bulk_insert"; properties: { db_type: string; format: "csv" | "json" | "excel" } }
	| { event: "chat_opened"; properties: { db_type: string } }
	| { event: "table_viewed"; properties: { db_type: string; table_name: string } }
	| { event: "connection_error"; properties: { db_type: string; status: number } };

export const initPosthog = (): void => {
	const key = import.meta.env.VITE_POSTHOG_KEY;
	if (!key) return;

	posthog.init(key, {
		api_host: "https://us.i.posthog.com",
		person_profiles: "identified_only",
		capture_pageview: false,
		capture_pageleave: true,
	});
};

export const posthogAnalytics = {
	capture<E extends AnalyticsEvent["event"]>(
		event: E,
		properties: Extract<AnalyticsEvent, { event: E }>["properties"],
	): void {
		if (!import.meta.env.VITE_POSTHOG_KEY) return;
		posthog.capture(event, properties);
	},
};
