import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-R: a query-runner result too large for one JSON string
// (V8 caps strings near 2^29 characters) made JSON.stringify throw RangeError while the
// response was written, so the user got a bare 500 and the error went to Sentry. The user
// must get a 4xx that says the result is too large and how to narrow it.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { connect } = await import("../src/connection.js");
const { app } = createServer();
await connect(databaseUrl);
const evidence: Record<string, unknown> = {};

const runQuery = async (query: string) => {
	const response = await app.handle(
		new Request(new URL(`/api/pg/query?${new URLSearchParams({ db })}`, "http://localhost"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query }),
		}),
	);
	const text = await response.text();
	const { requestId: _requestId, ...body } = JSON.parse(text) as Record<string, unknown>;
	return { status: response.status, body };
};

try {
	// About 600M characters of JSON: past the string limit.
	evidence.oversized = await runQuery(
		"SELECT repeat('x', 10000) AS v FROM generate_series(1, 60000)",
	);
	// Keep only what is deterministic: the timing differs on every run.
	const small = await runQuery("SELECT 1 AS one");
	evidence.small = { status: small.status, rows: (small.body.data as { rows: unknown }).rows };

	const oversized = evidence.oversized as { status: number; body: { error?: string } };
	assert.ok(
		oversized.status >= 400 && oversized.status < 500,
		`oversized: ${oversized.status} ${JSON.stringify(oversized.body)}`,
	);
	assert.match(oversized.body.error ?? "", /too large/i);
	assert.equal((evidence.small as { status: number }).status, 200);
	console.log("PASS an oversized query result answers 4xx with a clear message");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-oversized-query-result.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
process.exit(0);
