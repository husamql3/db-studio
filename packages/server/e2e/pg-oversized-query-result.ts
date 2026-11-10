import assert from "node:assert/strict";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-R: a query-runner result too large for one JSON string
// (V8 caps strings near 2^29 characters) made JSON.stringify throw RangeError while the
// response was written, so the user got a bare 500 and the error went to Sentry. The user
// must get a 4xx that says the result is too large and how to narrow it.
const { call } = await inProcessApp(requireDatabaseUrl("pg").url);
const evidence: Record<string, unknown> = {};

const runQuery = async (query: string) => {
	const { status, body } = await call("POST", "/query", { query });
	const { requestId: _requestId, ...rest } = body as Record<string, unknown>;

	return { status, body: rest };
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
	await writeArtifact("pg-oversized-query-result.json", evidence);
}

process.exit(0);
