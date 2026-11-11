import assert from "node:assert/strict";
import { inProcessApp, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-C (PostgreSQL), -T (MySQL) and -H (SQLite): opening a table
// that does not exist (dropped, renamed, or a stale /table/<name> URL after switching databases)
// answered 500 with the raw driver error and was reported to Sentry, instead of a 404 the grid
// can show. Runs against the SQL database in DATABASE_URL and writes
// e2e/artifacts/missing-table-<engine>.json.
const { call, close, dbType } = await inProcessApp();
const evidence: Record<string, unknown> = {};

const tableData = async (tableName: string) => {
	const { status, body } = await call(
		"GET",
		`/tables/${encodeURIComponent(tableName)}/data?limit=50`,
	);

	const { requestId: _requestId, ...rest } = body as Record<string, unknown>;

	return { status, body: rest };
};

try {
	evidence.missingTable = await tableData("device_keys");
	// A double quote in the name must be escaped, not end the identifier early.
	evidence.missingQuotedTable = await tableData('device"keys');

	for (const label of ["missingTable", "missingQuotedTable"]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 404, `${label}: ${JSON.stringify(body)}`);
	}

	console.log(`PASS ${dbType} missing table answers 404`);
} finally {
	await writeArtifact(`missing-table-${dbType}.json`, evidence);
	await close();
}
