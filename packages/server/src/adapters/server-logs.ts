import type { ServerLogsResult } from "@db-studio/shared/types";

/** Newest entries returned per read; older ones stay in the engine's own log. */
export const SERVER_LOGS_LIMIT = 500;

/**
 * Prefixed to every query that reads a server log, so the engines that log statements can
 * leave the log reads themselves out of the result.
 */
export const SERVER_LOGS_MARKER = "/* db-studio:server-logs */";

export const logsUnavailable = (reason: string): ServerLogsResult => ({
	available: false,
	reason,
});

/**
 * Keeps the newest {@link SERVER_LOGS_LIMIT} entries, oldest first. The sort is stable, so
 * entries that share a timestamp keep the order they arrive in: pass them oldest first.
 */
export const newestEntries = <T extends { ts: string }>(entries: T[]): T[] =>
	entries.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-SERVER_LOGS_LIMIT);

/**
 * Detail values are display strings: objects keep their JSON, and empty values are dropped so
 * the details panel lists only what the engine reported.
 */
export const logDetail = (fields: Record<string, unknown>): Record<string, string> =>
	Object.fromEntries(
		Object.entries(fields)
			.filter(([, v]) => v !== undefined && v !== null && v !== "")
			.map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
	);
