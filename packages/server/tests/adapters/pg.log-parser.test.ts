import { describe, expect, it } from "vitest";
import { parsePgLog } from "@/adapters/pg/pg.log-parser.js";
import { SERVER_LOGS_MARKER } from "@/adapters/server-logs.js";

// Failure modes for reading a PostgreSQL log file:
// - a DETAIL / HINT / CONTEXT / STATEMENT line becomes its own entry instead of joining the
//   entry above it
// - the tab-indented continuation of a multi-line statement is lost or becomes an entry
// - a `duration: … ms  statement: …` line keeps the duration in the message instead of
//   splitting it into durationMs and the query
// - an extended-protocol `execute <unnamed>:` duration line is not recognised as a query
// - FATAL / PANIC, LOG and DEBUGn map to the wrong level, or the engine's label is lost
// - a timestamp in a named zone (CEST) or with an offset (+02) is read as UTC
// - the partial first line of a tail read is parsed as an entry
// - csvlog: a quoted field with commas, doubled quotes or newlines splits the record
// - our own log-reading queries show up in the log they read

const OPTS = { logUtcOffsetMinutes: 0, truncatedStart: false };

describe("parsePgLog stderr", () => {
	it("attaches DETAIL and STATEMENT lines to the error above them", () => {
		const text = [
			"2026-10-19 13:15:17.710 UTC [2554] ERROR:  duplicate key value violates unique constraint \"customers_email_key\"",
			"2026-10-19 13:15:17.710 UTC [2554] DETAIL:  Key (email)=(a@example.com) already exists.",
			"2026-10-19 13:15:17.710 UTC [2554] STATEMENT:  INSERT INTO customers (email) VALUES ($1)",
			"2026-10-19 13:15:18.000 UTC [2555] LOG:  checkpoint starting: time",
		].join("\n");

		const entries = parsePgLog(text, "stderr", OPTS);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			level: "error",
			rawLevel: "ERROR",
			message: 'duplicate key value violates unique constraint "customers_email_key"',
			statement: "INSERT INTO customers (email) VALUES ($1)",
			detail: { pid: "2554", detail: "Key (email)=(a@example.com) already exists." },
		});
		expect(entries[1]).toMatchObject({ level: "info", message: "checkpoint starting: time" });
	});

	it("joins tab-indented continuation lines into the statement", () => {
		const text = [
			"2026-10-19 13:15:17.710 UTC [2554] LOG:  duration: 1503.250 ms  statement: SELECT *",
			"\tFROM orders",
			"\tWHERE id = 1",
		].join("\n");

		const [entry] = parsePgLog(text, "stderr", OPTS);

		expect(entry.durationMs).toBe(1503.25);
		expect(entry.message).toBe("SELECT *\nFROM orders\nWHERE id = 1");
	});

	it("splits extended-protocol duration lines into duration and query", () => {
		const text =
			"2026-10-19 13:15:17.710 UTC [2554] LOG:  duration: 0.412 ms  execute <unnamed>: SELECT * FROM users WHERE id = $1";

		const [entry] = parsePgLog(text, "stderr", OPTS);

		expect(entry).toMatchObject({
			durationMs: 0.412,
			message: "SELECT * FROM users WHERE id = $1",
		});
	});

	it("maps FATAL, PANIC, WARNING and DEBUG levels and keeps the engine's label", () => {
		const text = [
			"2026-10-19 13:00:00.000 UTC [1] FATAL:  password authentication failed for user \"app\"",
			"2026-10-19 13:00:01.000 UTC [1] PANIC:  could not write to file",
			"2026-10-19 13:00:02.000 UTC [1] WARNING:  there is no transaction in progress",
			"2026-10-19 13:00:03.000 UTC [1] DEBUG2:  autovacuum: processing database",
		].join("\n");

		const entries = parsePgLog(text, "stderr", OPTS);

		expect(entries.map((e) => [e.level, e.rawLevel])).toEqual([
			["fatal", "FATAL"],
			["fatal", "PANIC"],
			["warning", "WARNING"],
			["debug", "DEBUG2"],
		]);
	});

	it("reads named zones with the server's log offset and numeric offsets as written", () => {
		const text = [
			"2026-10-19 13:00:00.000 CEST [1] LOG:  named zone",
			"2026-10-19 13:00:00.000 +02 [1] LOG:  numeric offset",
			"2026-10-19 13:00:00 UTC [1] LOG:  utc without millis",
		].join("\n");

		const entries = parsePgLog(text, "stderr", { ...OPTS, logUtcOffsetMinutes: 120 });

		expect(entries.map((e) => e.ts)).toEqual([
			"2026-10-19T11:00:00.000Z",
			"2026-10-19T11:00:00.000Z",
			"2026-10-19T13:00:00.000Z",
		]);
	});

	it("drops the partial first line of a tail read", () => {
		const text = [
			"ment: SELECT 1",
			"\tFROM t",
			"2026-10-19 13:00:00.000 UTC [1] LOG:  checkpoint complete",
		].join("\n");

		const entries = parsePgLog(text, "stderr", { ...OPTS, truncatedStart: true });

		expect(entries.map((e) => e.message)).toEqual(["checkpoint complete"]);
	});

	it("leaves out the queries DB Studio runs to read the log", () => {
		const text = [
			`2026-10-19 13:00:00.000 UTC [1] LOG:  duration: 0.3 ms  statement: ${SERVER_LOGS_MARKER} SELECT pg_read_binary_file($1)`,
			"2026-10-19 13:00:01.000 UTC [1] LOG:  duration: 0.3 ms  statement: SELECT 1",
		].join("\n");

		expect(parsePgLog(text, "stderr", OPTS).map((e) => e.message)).toEqual(["SELECT 1"]);
	});
});

describe("parsePgLog csvlog", () => {
	const row = (fields: Record<number, string>) =>
		Array.from({ length: 26 }, (_, i) => fields[i] ?? "").join(",");

	it("keeps quoted commas, doubled quotes and newlines inside one record", () => {
		const text = [
			row({
				0: "2026-10-19 13:15:17.710 UTC",
				1: "app",
				2: "shop",
				3: "2554",
				11: "ERROR",
				12: "23505",
				13: '"duplicate key value violates unique constraint ""customers_email_key"""',
				14: '"Key (email, name)=(a@example.com, A) already exists."',
				19: '"INSERT INTO customers (email, name)\nVALUES ($1, $2)"',
				23: "client backend",
			}),
			row({
				0: "2026-10-19 13:15:18.000 UTC",
				3: "77",
				11: "LOG",
				12: "00000",
				13: "checkpoint starting: time",
				23: "checkpointer",
			}),
		].join("\n");

		const entries = parsePgLog(text, "csvlog", OPTS);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			ts: "2026-10-19T13:15:17.710Z",
			level: "error",
			code: "23505",
			source: "client backend",
			message: 'duplicate key value violates unique constraint "customers_email_key"',
			statement: "INSERT INTO customers (email, name)\nVALUES ($1, $2)",
			detail: {
				user: "app",
				database: "shop",
				pid: "2554",
				detail: "Key (email, name)=(a@example.com, A) already exists.",
			},
		});
		expect(entries[1]).toMatchObject({ source: "checkpointer", message: "checkpoint starting: time" });
		// 00000 is the "successful completion" SQLSTATE csvlog writes on every ordinary line.
		expect(entries[1].code).toBeUndefined();
	});

	it("drops a partial first record of a tail read", () => {
		const text = [
			'tail of a quoted field",,,,client backend,,0',
			row({ 0: "2026-10-19 13:00:00.000 UTC", 11: "LOG", 13: "checkpoint complete" }),
		].join("\n");

		const entries = parsePgLog(text, "csvlog", { ...OPTS, truncatedStart: true });

		expect(entries.map((e) => e.message)).toEqual(["checkpoint complete"]);
	});
});

describe("parsePgLog jsonlog", () => {
	it("maps jsonlog fields and splits duration lines", () => {
		const text = [
			JSON.stringify({
				timestamp: "2026-10-19 13:15:17.710 UTC",
				pid: 2554,
				error_severity: "LOG",
				message: "duration: 7.250 ms  statement: SELECT 1",
				backend_type: "client backend",
			}),
			JSON.stringify({
				timestamp: "2026-10-19 13:15:18.000 UTC",
				error_severity: "ERROR",
				state_code: "42P01",
				message: 'relation "t" does not exist',
				statement: "SELECT * FROM t",
			}),
		].join("\n");

		const entries = parsePgLog(text, "jsonlog", OPTS);

		expect(entries[0]).toMatchObject({
			level: "info",
			durationMs: 7.25,
			message: "SELECT 1",
			source: "client backend",
			detail: { pid: "2554" },
		});
		expect(entries[1]).toMatchObject({
			level: "error",
			code: "42P01",
			statement: "SELECT * FROM t",
		});
	});
});
