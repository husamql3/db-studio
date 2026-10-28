import type { ServerLogLevel } from "@db-studio/shared/types";

// Theme colours only: muted for routine lines, amber-500 for warnings as elsewhere in the
// app, destructive for failures.
export const LEVEL_TEXT: Record<ServerLogLevel, string> = {
	debug: "text-muted-foreground/60",
	info: "text-muted-foreground",
	warning: "text-amber-500",
	error: "text-destructive",
	fatal: "text-destructive font-semibold",
};

export const LEVEL_DOT: Record<ServerLogLevel, string> = {
	debug: "bg-muted-foreground/30",
	info: "bg-muted-foreground",
	warning: "bg-amber-500",
	error: "bg-destructive",
	fatal: "bg-destructive",
};

export const LEVEL_LABEL: Record<ServerLogLevel, string> = {
	debug: "debug",
	info: "info",
	warning: "warn",
	error: "error",
	fatal: "fatal",
};

export const formatDuration = (ms: number) => {
	if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
	return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

/** Over 1 s reads as slow and over 5 s as very slow, on every engine. */
export const durationTone = (ms: number) => {
	if (ms >= 5000) return "text-destructive";
	if (ms >= 1000) return "text-amber-500";
	return "text-muted-foreground/60";
};
