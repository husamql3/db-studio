import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Regression for DB-STUDIO-SERVER-C: opening a table that no longer exists (dropped, renamed,
// or a stale /table/<name> URL after switching databases) answered 500 with the raw 42P01
// driver message and was reported to Sentry, instead of a 404 the grid can show.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { getDbPool } = await import("../src/db-manager.js");
const { app } = createServer();
const evidence: Record<string, unknown> = {};

try {
	const params = new URLSearchParams({ db, limit: "50" });
	const response = await app.handle(
		new Request(
			new URL(
				`/api/pg/tables/dbstudio_table_that_does_not_exist/data?${params}`,
				"http://localhost",
			),
		),
	);
	const { requestId: _requestId, ...body } = (await response.json()) as Record<
		string,
		unknown
	>;
	evidence.missingTable = { status: response.status, body };
	assert.equal(response.status, 404, JSON.stringify(body));
	console.log("PASS PostgreSQL missing table answers 404");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-missing-table.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await (await getDbPool(db)).end();
}
