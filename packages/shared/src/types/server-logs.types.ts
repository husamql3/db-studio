import { z } from "zod";

export const SERVER_LOG_LEVELS = ["fatal", "error", "warning", "info", "debug"] as const;

export const serverLogLevelSchema = z.enum(SERVER_LOG_LEVELS);
export type ServerLogLevel = z.infer<typeof serverLogLevelSchema>;

export const serverLogEntrySchema = z.object({
	/** ISO 8601 in UTC. */
	ts: z.string(),
	level: serverLogLevelSchema,
	/** The engine's own severity label: LOG, Note, W, Information, 16… */
	rawLevel: z.string(),
	/** Backend type, subsystem, component or logger name. */
	source: z.string().optional(),
	/** SQLSTATE, error number, ORA- code… */
	code: z.string().optional(),
	/** For a query line, the query itself. */
	message: z.string(),
	durationMs: z.number().optional(),
	/** The statement behind an error line. */
	statement: z.string().optional(),
	/** Everything else the engine reported, keyed by its own field names. */
	detail: z.record(z.string(), z.string()),
});

export type ServerLogEntrySchemaType = z.infer<typeof serverLogEntrySchema>;

/**
 * A server that keeps its log out of reach is an expected state, not a failure: the Logs tab
 * explains the reason instead of showing an error.
 */
export type ServerLogsResult =
	| {
			available: true;
			/** Where the entries were read from, e.g. "system.query_log". */
			source: string;
			/** Oldest first. */
			entries: ServerLogEntrySchemaType[];
	  }
	| { available: false; reason: string };
