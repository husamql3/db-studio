import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-V: read-only writes answered 500 and went to Sentry.
// Query-runner inserts, grid inserts/edits/deletes/force deletes/bulk inserts and table deletion
// must answer 403, explain read-only mode, and leave the seeded row unchanged.
// Runs against PostgreSQL, MySQL or DuckDB:
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
	const created = await query(
		writable,
		`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, label VARCHAR(50))`,
	);
	assert.equal(created.status, 200, JSON.stringify(created.body));
	const seeded = await query(writable, `INSERT INTO ${TABLE} VALUES (1, 'original')`);
	assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

	await updateConnection(saved.id, { readOnly: true });
	const readOnly = await connect(databaseUrl);
	evidence.queryRunnerInsert = await query(readOnly, `INSERT INTO ${TABLE} VALUES (2, 'new')`);
	evidence.gridAddRecord = await call(
		readOnly,
		"POST",
		`/records?${new URLSearchParams({ db })}`,
		{ tableName: TABLE, data: { id: 2 } },
	);
	evidence.gridEditRecord = await call(
		readOnly,
		"PATCH",
		`/records?${new URLSearchParams({ db })}`,
		{
			tableName: TABLE,
			primaryKey: "id",
			updates: [{ rowData: { id: 1 }, columnName: "label", value: "changed" }],
		},
	);
	for (const [label, route] of [
		["gridDeleteRecord", "/records"],
		["gridForceDeleteRecord", "/records/force"],
	]) {
		evidence[label] = await call(
			readOnly,
			"DELETE",
			`${route}?${new URLSearchParams({ db })}`,
			{ tableName: TABLE, primaryKeys: [{ columnName: "id", value: 1 }] },
		);
	}
	evidence.gridBulkInsert = await call(
		readOnly,
		"POST",
		`/records/bulk?${new URLSearchParams({ db })}`,
		{ tableName: TABLE, records: [{ id: 3 }, { id: 4 }] },
	);
	evidence.gridDeleteTable = await call(
		readOnly,
		"DELETE",
		`/tables/${TABLE}?${new URLSearchParams({ db })}`,
	);
	const read = await query(readOnly, `SELECT id, label FROM ${TABLE} ORDER BY id`);
	const rows = (read.body.data as { rows?: unknown[] } | undefined)?.rows;
	// Keep the artifact the same on every run: retain rows, without query timings.
	evidence.readStillWorks = { status: read.status, rows };

	for (const label of [
		"queryRunnerInsert",
		"gridAddRecord",
		"gridEditRecord",
		"gridDeleteRecord",
		"gridForceDeleteRecord",
		"gridBulkInsert",
		"gridDeleteTable",
	]) {
		const { status, body } = evidence[label] as { status: number; body: { error?: string } };
		assert.equal(status, 403, `${label}: ${JSON.stringify(body)}`);
		assert.match(body.error ?? "", /read-only/i, `${label}: ${JSON.stringify(body)}`);
	}
	assert.equal(read.status, 200, JSON.stringify(read.body));
	assert.deepEqual(rows, [{ id: 1, label: "original" }]);
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
