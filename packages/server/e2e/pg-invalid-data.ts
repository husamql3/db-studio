import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

// Regression for DB-STUDIO-SERVER-S (and K): a value PostgreSQL cannot read as the column's type
// (a malformed date, text in an integer column, a string past varchar's length) raises a class 22
// "data exception". It answered 500 and went to Sentry, though the user's input caused it, on both
// inserts and grid filters. It must answer 400 with the driver's message, which names the value.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const admin = new pg.Pool({ connectionString: databaseUrl });
const evidence: Record<string, unknown> = {};
const TABLE = "dbstudio_e2e_typed";

try {
	await admin.query(`DROP TABLE IF EXISTS ${TABLE}`);
	await admin.query(`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, born DATE, code VARCHAR(3))`);

	const { createServer } = await import("../src/utils/create-server.js");
	const { connect } = await import("../src/connection.js");
	const { getDbPool } = await import("../src/db-manager.js");
	const { app } = createServer();
	await connect(databaseUrl);

	const call = async (method: string, route: string, body?: unknown) => {
		const response = await app.handle(
			new Request(new URL(`/api/pg${route}`, "http://localhost"), {
				method,
				headers: body ? { "Content-Type": "application/json" } : {},
				body: body ? JSON.stringify(body) : undefined,
			}),
		);
		const { requestId: _requestId, ...json } = (await response.json()) as Record<
			string,
			unknown
		>;
		return { status: response.status, body: json };
	};
	const insert = (data: Record<string, unknown>) =>
		call("POST", `/records?${new URLSearchParams({ db })}`, { tableName: TABLE, data });

	evidence.badDate = await insert({ id: 1, born: "29/10/2026", code: "a" });
	evidence.textInInteger = await insert({ id: "one", born: "2026-10-29", code: "a" });
	evidence.tooLong = await insert({ id: 2, born: "2026-10-29", code: "abcd" });
	evidence.valid = await insert({ id: 3, born: "2026-10-29", code: "abc" });
	// Editing a cell and bulk-inserting rows go through their own catch blocks in the adapter.
	evidence.updateBadDate = await call("PATCH", `/records?${new URLSearchParams({ db })}`, {
		tableName: TABLE,
		primaryKey: "id",
		updates: [{ rowData: { id: 3 }, columnName: "born", value: "29/10/2026" }],
	});
	evidence.bulkTooLong = await call("POST", `/records/bulk?${new URLSearchParams({ db })}`, {
		tableName: TABLE,
		records: [{ id: 4, born: "2026-10-29", code: "abcd" }],
	});
	const filters = JSON.stringify([{ columnName: "id", operator: "=", value: "one" }]);
	evidence.filterTextOnInteger = await call(
		"GET",
		`/tables/${TABLE}/data?${new URLSearchParams({ db, limit: "50", filters })}`,
	);
	await (await getDbPool(db)).end();

	for (const label of [
		"badDate",
		"textInInteger",
		"tooLong",
		"updateBadDate",
		"bulkTooLong",
		"filterTextOnInteger",
	]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 400, `${label}: ${JSON.stringify(body)}`);
	}
	assert.equal((evidence.valid as { status: number }).status, 200);
	console.log("PASS PostgreSQL data exceptions answer 400");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-invalid-data.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await admin.query(`DROP TABLE IF EXISTS ${TABLE}`);
	await admin.end();
}
