import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-V: a write sent through a read-only connection (an INSERT in
// the query runner, or adding a row in the grid) reached the database, which refused it as a
// read-only session should, but the refusal answered 500 and went to Sentry. It must answer 403
// and say the connection is read-only. Runs against PostgreSQL, MySQL or DuckDB:
//   DATABASE_URL=<url> bunx tsx e2e/read-only-writes.ts
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL ?? "";
const dbType = { postgresql: "pg", mysql: "mysql", duckdb: "duckdb" }[
	databaseUrl.split("://")[0]
];
if (!dbType)
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL, MySQL or DuckDB database");
const db =
	dbType === "duckdb"
		? path.parse(new URL(databaseUrl).pathname).name
		: decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
// Saving connections must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const { createServer } = await import("../src/utils/create-server.js");
const { connect, updateConnection } = await import("../src/connection.js");
const { listSavedConnections } = await import("../src/connections-store.js");
const { app } = createServer();
const TABLE = "dbstudio_e2e_readonly";
const evidence: Record<string, unknown> = {};

const call = async (connectionId: string, method: string, route: string, body?: unknown) => {
	const response = await app.handle(
		new Request(new URL(`/api/${dbType}${route}`, "http://localhost"), {
			method,
			headers: {
				"X-Connection-Id": connectionId,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		}),
	);
	const { requestId: _requestId, ...json } = (await response.json()) as Record<
		string,
		unknown
	>;
	return { status: response.status, body: json };
};
const query = (connectionId: string, sql: string) =>
	call(connectionId, "POST", `/query?${new URLSearchParams({ db })}`, { query: sql });

const writable = await connect(databaseUrl);
const [saved] = await listSavedConnections();
try {
	await query(writable, `DROP TABLE IF EXISTS ${TABLE}`);
	const created = await query(writable, `CREATE TABLE ${TABLE} (id INT PRIMARY KEY)`);
	assert.equal(created.status, 200, JSON.stringify(created.body));

	await updateConnection(saved.id, { readOnly: true });
	const readOnly = await connect(databaseUrl);
	evidence.queryRunnerInsert = await query(readOnly, `INSERT INTO ${TABLE} VALUES (1)`);
	evidence.gridAddRecord = await call(
		readOnly,
		"POST",
		`/records?${new URLSearchParams({ db })}`,
		{ tableName: TABLE, data: { id: 2 } },
	);
	evidence.readStillWorks = await query(readOnly, `SELECT COUNT(*) AS n FROM ${TABLE}`);

	for (const label of ["queryRunnerInsert", "gridAddRecord"]) {
		const { status, body } = evidence[label] as { status: number; body: { error?: string } };
		assert.equal(status, 403, `${label}: ${JSON.stringify(body)}`);
		assert.match(body.error ?? "", /read-only/i, `${label}: ${JSON.stringify(body)}`);
	}
	assert.equal((evidence.readStillWorks as { status: number }).status, 200);
	// Keep the artifact the same on every run: drop timings and engine-specific count types.
	evidence.readStillWorks = { status: 200 };
	console.log(`PASS ${dbType} read-only writes answer 403`);
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL(`./artifacts/read-only-writes-${dbType}.json`, import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await updateConnection(saved.id, { readOnly: false });
	await query(await connect(databaseUrl), `DROP TABLE IF EXISTS ${TABLE}`);
}
process.exit(0);
