export type MetricPoint = { date: string; installations: number; events: number };
export type BreakdownItem = { name: string; value: number };

export type AdminOverview = {
	generatedAt: string;
	rangeDays: 7 | 30 | 90;
	sources: {
		posthog: "available" | "unconfigured" | "unavailable";
		sentry: "available" | "unconfigured" | "unavailable";
	};
	totals: { activeInstallations: number; events: number; errors: number; p95Ms: number };
	activity: MetricPoint[];
	features: BreakdownItem[];
	engines: BreakdownItem[];
	releases: BreakdownItem[];
	errorsBySource: BreakdownItem[];
};

type AnalyticsEnv = {
	POSTHOG_PERSONAL_API_KEY?: string;
	POSTHOG_PROJECT_ID?: string;
	POSTHOG_HOST?: string;
	SENTRY_AUTH_TOKEN?: string;
	SENTRY_ORG?: string;
	SENTRY_HOST?: string;
};

export type AdminFilters = {
	source?: "client" | "server";
	engine?: "pg" | "mysql" | "mssql" | "mongodb" | "sqlite" | "redis";
	feature?: string;
	release?: string;
};

type PostHogResult = { results?: unknown[][] };
type SentryEvents = { data?: Array<Record<string, unknown>> };

const posthogQuery = async (env: AnalyticsEnv, query: string): Promise<unknown[][]> => {
	const response = await fetch(
		`${env.POSTHOG_HOST ?? "https://eu.posthog.com"}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
		},
	);
	if (!response.ok) throw new Error("PostHog query failed");
	return ((await response.json()) as PostHogResult).results ?? [];
};

const numberValue = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;

const getPosthog = async (env: AnalyticsEnv, days: number, filters: AdminFilters) => {
	if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_PROJECT_ID) return null;
	const featureEvents = [
		"db_connected",
		"db_selected",
		"query_executed",
		"record_created",
		"record_deleted",
		"record_exported",
		"table_created",
		"column_added",
		"bulk_insert",
		"chat_opened",
		"table_viewed",
	];
	const clauses = [
		filters.source ? `properties.source = '${filters.source}'` : undefined,
		filters.engine ? `properties.db_type = '${filters.engine}'` : undefined,
		filters.feature ? `event = '${filters.feature}'` : undefined,
		filters.release ? `properties.app_version = '${filters.release}'` : undefined,
	].filter(Boolean);
	const where = clauses.length > 0 ? ` and ${clauses.join(" and ")}` : "";
	const [totalRows, activityRows, featureRows, engineRows, releaseRows] = await Promise.all([
		posthogQuery(
			env,
			`select uniq(distinct_id), count() from events where timestamp >= now() - interval ${days} day${where}`,
		),
		posthogQuery(
			env,
			`select toDate(timestamp), uniq(distinct_id), count() from events where timestamp >= now() - interval ${days} day${where} group by toDate(timestamp) order by toDate(timestamp)`,
		),
		posthogQuery(
			env,
			`select event, count() from events where timestamp >= now() - interval ${days} day and event in (${featureEvents.map((event) => `'${event}'`).join(",")})${where} group by event order by count() desc`,
		),
		posthogQuery(
			env,
			`select properties.db_type, count() from events where timestamp >= now() - interval ${days} day and properties.db_type in ('pg','mysql','mssql','mongodb','sqlite','redis')${where} group by properties.db_type order by count() desc`,
		),
		posthogQuery(
			env,
			`select properties.app_version, uniq(distinct_id) from events where timestamp >= now() - interval ${days} day and notEmpty(properties.app_version)${where} group by properties.app_version order by uniq(distinct_id) desc limit 10`,
		),
	]);
	const activity = activityRows.map(([date, installations, events]) => ({
		date: String(date),
		installations: numberValue(installations),
		events: numberValue(events),
	}));
	const breakdown = (rows: unknown[][]): BreakdownItem[] =>
		rows.map(([name, value]) => ({ name: String(name), value: numberValue(value) }));
	return {
		activity,
		features: breakdown(featureRows),
		engines: breakdown(engineRows),
		releases: breakdown(releaseRows),
		activeInstallations: numberValue(totalRows[0]?.[0]),
		events: numberValue(totalRows[0]?.[1]),
	};
};

const getSentry = async (env: AnalyticsEnv, days: number, filters: AdminFilters) => {
	if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG) return null;
	const projects = filters.source
		? `project:db-studio-${filters.source === "client" ? "web" : "server"}`
		: "(project:db-studio-web OR project:db-studio-server)";
	const query = `${projects}${filters.release ? ` release:${filters.release}` : ""}`;
	const params = new URLSearchParams({
		dataset: "errors",
		field: "project",
		statsPeriod: `${days}d`,
		query,
	});
	params.append("field", "count()");
	const spanParams = new URLSearchParams({
		dataset: "spans",
		field: "p95(span.duration)",
		statsPeriod: `${days}d`,
		query,
	});
	const base = `${env.SENTRY_HOST ?? "https://de.sentry.io"}/api/0/organizations/${env.SENTRY_ORG}/events/`;
	const [errorResponse, spanResponse] = await Promise.all([
		fetch(`${base}?${params}`, {
			headers: { authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}` },
		}),
		fetch(`${base}?${spanParams}`, {
			headers: { authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}` },
		}),
	]);
	if (!errorResponse.ok) throw new Error("Sentry query failed");
	// Discover wraps results: { data: [...], meta: {...} } — not a bare array.
	const rows = ((await errorResponse.json()) as SentryEvents).data ?? [];
	const spanRows = spanResponse.ok
		? (((await spanResponse.json()) as SentryEvents).data ?? [])
		: [];
	const errorsBySource = rows.map((row) => ({
		name: String(row.project ?? "unknown"),
		value: numberValue(row["count()"]),
	}));
	return {
		errorsBySource,
		errors: errorsBySource.reduce((sum, item) => sum + item.value, 0),
		p95Ms: Math.round(numberValue(spanRows[0]?.["p95(span.duration)"])),
	};
};

export const getAdminOverview = async (
	env: AnalyticsEnv,
	rangeDays: 7 | 30 | 90,
	filters: AdminFilters = {},
): Promise<AdminOverview> => {
	const [posthogResult, sentryResult] = await Promise.allSettled([
		getPosthog(env, rangeDays, filters),
		getSentry(env, rangeDays, filters),
	]);
	const posthog = posthogResult.status === "fulfilled" ? posthogResult.value : null;
	const sentry = sentryResult.status === "fulfilled" ? sentryResult.value : null;
	return {
		generatedAt: new Date().toISOString(),
		rangeDays,
		sources: {
			posthog: !env.POSTHOG_PERSONAL_API_KEY
				? "unconfigured"
				: posthogResult.status === "rejected"
					? "unavailable"
					: "available",
			sentry: !env.SENTRY_AUTH_TOKEN
				? "unconfigured"
				: sentryResult.status === "rejected"
					? "unavailable"
					: "available",
		},
		totals: {
			activeInstallations: posthog?.activeInstallations ?? 0,
			events: posthog?.events ?? 0,
			errors: sentry?.errors ?? 0,
			p95Ms: sentry?.p95Ms ?? 0,
		},
		activity: posthog?.activity ?? [],
		features: posthog?.features ?? [],
		engines: posthog?.engines ?? [],
		releases: posthog?.releases ?? [],
		errorsBySource: sentry?.errorsBySource ?? [],
	};
};
