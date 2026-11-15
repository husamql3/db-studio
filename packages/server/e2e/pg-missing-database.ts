import assert from "node:assert/strict";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-14 and -16: once a database was dropped while db-studio had it
// open, listing its tables or the server's databases answered 500 with SQLSTATE 3D000 and was
// reported to Sentry, instead of a 404 the app can show. Failure modes covered:
// - a database dropped after db-studio opened it answers 500 instead of 404;
// - a database that never existed (a stale ?db= after switching servers) answers 500.
// Runs against a disposable PostgreSQL in DATABASE_URL and writes
// e2e/artifacts/pg-missing-database.json.
const { url } = requireDatabaseUrl("pg");
const scratch = "dbstudio_e2e_dropped";

const admin = await inProcessApp(url);
const evidence: Record<string, unknown> = {};

const strip = ({ status, body }: { status: number; body: unknown }) => {
	const { requestId: _requestId, ...rest } = body as Record<string, unknown>;

	return { status, body: rest };
};

try {
	await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
	await admin.query(`CREATE DATABASE ${scratch}`);

	evidence.tablesBeforeDrop = strip(await admin.call("GET", `/tables?db=${scratch}`));
	await admin.query(`DROP DATABASE ${scratch} WITH (FORCE)`);
	evidence.tablesAfterDrop = strip(await admin.call("GET", `/tables?db=${scratch}`));
	evidence.tablesNeverExisted = strip(
		await admin.call("GET", "/tables?db=dbstudio_e2e_never"),
	);

	assert.equal((evidence.tablesBeforeDrop as { status: number }).status, 200);

	for (const label of ["tablesAfterDrop", "tablesNeverExisted"]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 404, `${label}: ${JSON.stringify(body)}`);
	}

	console.log("PASS pg missing database answers 404");
} finally {
	await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`).catch(() => {});
	await writeArtifact("pg-missing-database.json", evidence);
	await admin.close();
}
