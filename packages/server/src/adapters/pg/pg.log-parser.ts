import type { ServerLogEntrySchemaType, ServerLogLevel } from "@db-studio/shared/types";
import { logDetail, SERVER_LOGS_MARKER } from "@/adapters/server-logs.js";

export type PgLogFormat = "jsonlog" | "csvlog" | "stderr";

interface ParseOptions {
	/** UTC offset of `log_timezone`, applied to timestamps that carry a zone name. */
	logUtcOffsetMinutes: number;
	/** The text starts mid-file, so its first line or record is partial. */
	truncatedStart: boolean;
}

/** The fields shared by all three formats, before the duration and statement are split out. */
interface RawEntry {
	ts: string;
	severity: string;
	message: string;
	code?: string;
	source?: string;
	statement?: string;
	detail: Record<string, string>;
}

const LEVELS: Record<string, ServerLogLevel> = {
	PANIC: "fatal",
	FATAL: "fatal",
	ERROR: "error",
	WARNING: "warning",
	NOTICE: "info",
	INFO: "info",
	LOG: "info",
};

// `duration: 1.2 ms  statement: …`, `… execute <unnamed>: …`, or a bare `duration: 1.2 ms`
// when only log_duration is on.
const DURATION_LINE =
	/^duration: ([\d.]+) ms(?:\s+(?:statement|(?:execute|bind|parse) [^:]*): ([\s\S]*))?$/;

const TIMESTAMP =
	/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?: (?:([A-Za-z]+)|([+-])(\d{2}):?(\d{2})?))?/;

/** Reads a log timestamp, which PostgreSQL writes in `log_timezone`, as an ISO string in UTC. */
const toIso = (text: string, logUtcOffsetMinutes: number): string | undefined => {
	const m = TIMESTAMP.exec(text);
	if (!m) return undefined;
	const [, y, mo, d, h, mi, s, frac = "", zoneName, sign, offH, offM = "0"] = m;
	const offset = sign
		? (sign === "-" ? -1 : 1) * (Number(offH) * 60 + Number(offM))
		: zoneName === "UTC" || zoneName === "GMT"
			? 0
			: logUtcOffsetMinutes;
	const ms = Number(frac.padEnd(3, "0").slice(0, 3));
	const utc =
		Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms) -
		offset * 60_000;
	return new Date(utc).toISOString();
};

const toEntry = (raw: RawEntry): ServerLogEntrySchemaType => {
	const duration = DURATION_LINE.exec(raw.message);
	return {
		ts: raw.ts,
		level: LEVELS[raw.severity] ?? "debug",
		rawLevel: raw.severity,
		source: raw.source || undefined,
		// 00000 is SQLSTATE "successful completion", which csvlog writes on every ordinary line.
		code: raw.code && raw.code !== "00000" ? raw.code : undefined,
		message: duration ? (duration[2] ?? "duration") : raw.message,
		durationMs: duration ? Number(duration[1]) : undefined,
		statement: raw.statement || undefined,
		detail: raw.detail,
	};
};

const isOwnQuery = (raw: RawEntry) =>
	raw.message.includes(SERVER_LOGS_MARKER) || raw.statement?.includes(SERVER_LOGS_MARKER);

// ─── stderr ──────────────────────────────────────────────────────────────────────────
// The line prefix is whatever log_line_prefix says, so only the parts every prefix shares
// are read: a timestamp if %m or %t is in it, and a pid if %p is wrapped in brackets.

const STDERR_LINE =
	/^(.*?)\b(DEBUG[1-5]|LOG|INFO|NOTICE|WARNING|ERROR|FATAL|PANIC|DETAIL|HINT|QUERY|CONTEXT|LOCATION|STATEMENT): {2}(.*)$/;

/** Lines that belong to the entry above them rather than starting one. */
const ATTACHED = new Set(["DETAIL", "HINT", "QUERY", "CONTEXT", "LOCATION", "STATEMENT"]);

const parseStderr = (lines: string[], opts: ParseOptions): RawEntry[] => {
	const entries: RawEntry[] = [];
	// The field the next tab-indented line continues.
	let continues: ((line: string) => void) | null = null;

	for (const line of lines) {
		if (line.startsWith("\t")) {
			continues?.(line.slice(1));
			continue;
		}
		const m = STDERR_LINE.exec(line);
		if (!m) {
			continues = null;
			continue;
		}
		const [, prefix, severity, text] = m;
		const current = entries.at(-1);

		if (ATTACHED.has(severity)) {
			if (!current) continue;
			if (severity === "STATEMENT") {
				current.statement = text;
				continues = (more) => {
					current.statement = `${current.statement}\n${more}`;
				};
			} else {
				const key = severity.toLowerCase();
				current.detail[key] = text;
				continues = (more) => {
					current.detail[key] = `${current.detail[key]}\n${more}`;
				};
			}
			continue;
		}

		const ts = toIso(prefix, opts.logUtcOffsetMinutes) ?? current?.ts;
		if (!ts) continue;
		const entry: RawEntry = {
			ts,
			severity,
			message: text,
			detail: logDetail({ pid: /\[(\d+)\]/.exec(prefix)?.[1] }),
		};
		entries.push(entry);
		continues = (more) => {
			entry.message = `${entry.message}\n${more}`;
		};
	}
	return entries;
};

// ─── csvlog ──────────────────────────────────────────────────────────────────────────

/** Splits CSV into records; quoted fields may hold commas, `""` and newlines. */
const parseCsv = (text: string): string[][] => {
	const records: string[][] = [];
	let record: string[] = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			record.push(field);
			field = "";
		} else if (ch === "\n") {
			record.push(field);
			records.push(record);
			record = [];
			field = "";
		} else if (ch !== "\r") {
			field += ch;
		}
	}
	if (field || record.length) {
		record.push(field);
		records.push(record);
	}
	return records;
};

const RECORD_START = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

const parseCsvlog = (text: string, opts: ParseOptions): RawEntry[] => {
	// A tail read can start inside a quoted field, so resume at the first line that opens a
	// record rather than trusting the quote state.
	let body = text;
	if (opts.truncatedStart) {
		const lines = text.split("\n");
		const start = lines.findIndex((line, i) => i > 0 && RECORD_START.test(line));
		body = start === -1 ? "" : lines.slice(start).join("\n");
	}

	const entries: RawEntry[] = [];
	for (const f of parseCsv(body)) {
		const ts = toIso(f[0] ?? "", opts.logUtcOffsetMinutes);
		if (!ts || !f[11]) continue;
		entries.push({
			ts,
			severity: f[11],
			code: f[12],
			message: f[13] ?? "",
			statement: f[19],
			source: f[23],
			detail: logDetail({
				user: f[1],
				database: f[2],
				pid: f[3],
				client: f[4],
				application: f[22],
				detail: f[14],
				hint: f[15],
				query: f[16],
				context: f[18],
			}),
		});
	}
	return entries;
};

// ─── jsonlog ─────────────────────────────────────────────────────────────────────────

interface JsonlogLine {
	timestamp?: string;
	user?: string;
	dbname?: string;
	pid?: number;
	remote_host?: string;
	error_severity?: string;
	state_code?: string;
	message?: string;
	detail?: string;
	hint?: string;
	internal_query?: string;
	context?: string;
	statement?: string;
	application_name?: string;
	backend_type?: string;
}

const parseJsonlog = (lines: string[], opts: ParseOptions): RawEntry[] => {
	const entries: RawEntry[] = [];
	for (const line of lines) {
		let json: JsonlogLine;
		try {
			json = JSON.parse(line) as JsonlogLine;
		} catch {
			continue;
		}
		const ts = toIso(json.timestamp ?? "", opts.logUtcOffsetMinutes);
		if (!ts || !json.error_severity) continue;
		entries.push({
			ts,
			severity: json.error_severity,
			code: json.state_code,
			message: json.message ?? "",
			statement: json.statement,
			source: json.backend_type,
			detail: logDetail({
				user: json.user,
				database: json.dbname,
				pid: json.pid,
				client: json.remote_host,
				application: json.application_name,
				detail: json.detail,
				hint: json.hint,
				query: json.internal_query,
				context: json.context,
			}),
		});
	}
	return entries;
};

export const parsePgLog = (
	text: string,
	format: PgLogFormat,
	opts: ParseOptions,
): ServerLogEntrySchemaType[] => {
	const lines = text.split("\n");
	if (opts.truncatedStart && format !== "csvlog") lines.shift();

	const raw =
		format === "csvlog"
			? parseCsvlog(text, opts)
			: format === "jsonlog"
				? parseJsonlog(lines, opts)
				: parseStderr(lines, opts);

	return raw.filter((entry) => !isOwnQuery(entry)).map(toEntry);
};
