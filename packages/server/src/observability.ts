import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import * as Sentry from "@sentry/node";
import { HTTPException } from "hono/http-exception";
import { PostHog } from "posthog-node";
import packageJson from "../package.json" with { type: "json" };

type DurationBucket = "under_100ms" | "100ms_1s" | "1s_5s" | "over_5s";
type Outcome = "success" | "client_error" | "server_error";

type TelemetryState = {
	installationId: string;
	enabled: boolean;
	lastActiveAt?: string;
};

type ServerEvent =
	| { event: "installation_active"; properties: { runtime: string; os: string } }
	| {
			event: "server_operation";
			properties: {
				operation: string;
				method: string;
				outcome: Outcome;
				duration_bucket: DurationBucket;
				db_type?: DatabaseTypeSchema;
			};
	  };

const isTestOrDevelopment = () =>
	process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";

const telemetryStatePath = () => {
	const base =
		process.env.DB_STUDIO_DATA_DIR ??
		process.env.XDG_STATE_HOME ??
		(process.platform === "win32"
			? process.env.LOCALAPPDATA
			: path.join(homedir(), ".local", "state"));
	return path.join(base || path.join(homedir(), ".db-studio"), "db-studio", "telemetry.json");
};

const writeState = (value: TelemetryState): void => {
	try {
		const file = telemetryStatePath();
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
	} catch {
		// Telemetry persistence is best-effort and cannot affect the product.
	}
};

const createState = (): TelemetryState => ({ installationId: randomUUID(), enabled: true });

const readState = (): TelemetryState => {
	const file = telemetryStatePath();
	try {
		if (existsSync(file)) {
			const value = JSON.parse(readFileSync(file, "utf8")) as Partial<TelemetryState>;
			if (typeof value.installationId === "string" && typeof value.enabled === "boolean") {
				return {
					installationId: value.installationId,
					enabled: value.enabled,
					lastActiveAt:
						typeof value.lastActiveAt === "string" ? value.lastActiveAt : undefined,
				};
			}
		}
	} catch {
		// A damaged local telemetry file must never prevent DB Studio from starting.
	}
	const value = createState();
	writeState(value);
	return value;
};

let state: TelemetryState | undefined;
let posthog: PostHog | undefined;
const OFFICIAL_SENTRY_DSN =
	"https://a1e890d1105f1f27fcb1dbead71c30dd@o4509725125181440.ingest.de.sentry.io/4512040493383760";
const OFFICIAL_POSTHOG_KEY = "phc_nxaQk54MWAehmL72J4gjVbrQCpbSTedMyHn3PvFxAhkd";
const currentState = (): TelemetryState => (state ??= readState());

export const isTelemetryEnabled = (): boolean =>
	!isTestOrDevelopment() && process.env.DB_STUDIO_TELEMETRY !== "0" && currentState().enabled;

export const getTelemetryConfig = () => ({
	enabled: isTelemetryEnabled(),
	installationId: currentState().installationId,
	appVersion: packageJson.version,
});

export const setTelemetryEnabled = (enabled: boolean): void => {
	state = { ...currentState(), enabled };
	writeState(state);
	if (enabled) {
		void posthog?.enable();
		initServerObservability();
	} else {
		void posthog?.disable();
		void Sentry.close(500);
	}
};

export const resetTelemetryId = (): string => {
	state = { ...currentState(), installationId: randomUUID(), lastActiveAt: undefined };
	writeState(state);
	return state.installationId;
};

export const durationBucket = (durationMs: number): DurationBucket => {
	if (durationMs < 100) return "under_100ms";
	if (durationMs < 1_000) return "100ms_1s";
	if (durationMs < 5_000) return "1s_5s";
	return "over_5s";
};

export const outcomeForStatus = (status: number): Outcome => {
	if (status >= 500) return "server_error";
	if (status >= 400) return "client_error";
	return "success";
};

export const operationForRequest = (method: string, pathname: string): string => {
	const pathWithoutType = pathname.replace(
		/^\/api\/(?:pg|mysql|mssql|mongodb|sqlite|redis)(?=\/|$)/,
		"/api",
	);
	const rules: Array<[RegExp, string]> = [
		[/^\/api\/databases(?:\/|$)/, "databases"],
		[/^\/api\/tables(?:\/|$)/, "tables"],
		[/^\/api\/records(?:\/|$)/, "records"],
		[/^\/api\/query(?:\/|$)/, "query"],
		[/^\/api\/keys(?:\/|$)/, "keys"],
		[/^\/api\/chat(?:\/|$)/, "chat"],
	];
	const resource = rules.find(([pattern]) => pattern.test(pathWithoutType))?.[1] ?? "other";
	return `${method.toLowerCase()}_${resource}`;
};

export const initServerObservability = (): void => {
	if (!isTelemetryEnabled()) return;
	const sentryDsn = process.env.DB_STUDIO_SENTRY_DSN ?? OFFICIAL_SENTRY_DSN;
	if (
		sentryDsn &&
		(!Sentry.isInitialized() || Sentry.getClient()?.getOptions().enabled === false)
	) {
		Sentry.init({
			dsn: sentryDsn,
			environment: process.env.NODE_ENV ?? "production",
			release: `db-studio@${packageJson.version}`,
			tracesSampleRate: 0.1,
			sendDefaultPii: false,
			defaultIntegrations: false,
			beforeSend(event) {
				delete event.request;
				delete event.user;
				delete event.breadcrumbs;
				return event;
			},
			beforeSendSpan(span) {
				return {
					...span,
					data: Object.fromEntries(
						Object.entries(span.data ?? {}).filter(([key]) => key.startsWith("db_studio.")),
					),
				};
			},
		});
	}

	const posthogKey = process.env.DB_STUDIO_POSTHOG_KEY ?? OFFICIAL_POSTHOG_KEY;
	if (posthogKey && !posthog) {
		posthog = new PostHog(posthogKey, {
			host: process.env.DB_STUDIO_POSTHOG_HOST ?? "https://eu.i.posthog.com",
			flushAt: 20,
			flushInterval: 10_000,
			requestTimeout: 2_000,
		});
	}
};

export const captureServerEvent = (event: ServerEvent): void => {
	if (!isTelemetryEnabled() || !posthog) return;
	posthog.capture({
		distinctId: currentState().installationId,
		event: event.event,
		properties: {
			...event.properties,
			source: "server",
			app_version: packageJson.version,
			$geoip_disable: false,
		},
	});
};

export const captureInstallationActive = (): void => {
	if (!isTelemetryEnabled()) return;
	const current = currentState();
	const lastActive = current.lastActiveAt ? Date.parse(current.lastActiveAt) : 0;
	if (Date.now() - lastActive < 86_400_000) return;
	state = { ...current, lastActiveAt: new Date().toISOString() };
	writeState(state);
	captureServerEvent({
		event: "installation_active",
		properties: { runtime: `node-${process.versions.node.split(".")[0]}`, os: platform() },
	});
};

export const captureServerError = (error: unknown, operation: string): void => {
	if (!isTelemetryEnabled()) return;
	// HTTPException does not set `name`, so only instanceof separates expected
	// 4xx/5xx responses from genuine runtime crashes.
	const errorKind = error instanceof HTTPException ? "http" : "runtime";
	const sanitized = new Error("Server operation failed");
	sanitized.stack = undefined;
	Sentry.captureException(sanitized, {
		tags: {
			operation,
			source: "server",
			release: packageJson.version,
			error_kind: errorKind,
		},
		fingerprint: [operation, errorKind],
	});
};

export const startServerSpan = <T>(
	operation: string,
	dbType: DatabaseTypeSchema | undefined,
	callback: () => T,
): T =>
	Sentry.startSpan(
		{
			name: operation,
			op: "http.server",
			attributes: {
				"db_studio.operation": operation,
				...(dbType ? { "db_studio.db_type": dbType } : {}),
			},
		},
		callback,
	);

export const writeOperationalLog = (
	level: "info" | "error",
	event: string,
	fields: Record<string, string | number | undefined>,
): void => {
	const safeFields = Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	);
	process.stderr.write(
		`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeFields })}\n`,
	);
};
