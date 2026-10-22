import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-F: adding a record that breaks a constraint (a foreign key
// pointing at no row, a duplicate primary key, a missing NOT NULL value) answered 500 and was
// reported to Sentry, though the user's data caused it. It must answer 409 with the driver's
// message, which names the constraint the user has to satisfy.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { getDbPool } = await import("../src/db-manager.js");
const { connect } = await import("../src/connection.js");
const { app } = createServer();
await connect(databaseUrl);
const pool = await getDbPool(db);
const evidence: Record<string, unknown> = {};

const addRecord = async (data: Record<string, unknown>) => {
	const params = new URLSearchParams({ db });
	const response = await app.handle(
		new Request(new URL(`/api/pg/records?${params}`, "http://localhost"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tableName: "dbstudio_e2e_child", data }),
		}),
	);
	const { requestId: _requestId, ...body } = (await response.json()) as Record<
		string,
		unknown
	>;
	return { status: response.status, body };
};

try {
	await pool.query("DROP TABLE IF EXISTS dbstudio_e2e_child, dbstudio_e2e_parent");
	await pool.query("CREATE TABLE dbstudio_e2e_parent (id INT PRIMARY KEY)");
	await pool.query(
		`CREATE TABLE dbstudio_e2e_child (
			id INT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id INT REFERENCES dbstudio_e2e_parent(id)
		)`,
	);
	await pool.query("INSERT INTO dbstudio_e2e_parent VALUES (1)");
	await pool.query("INSERT INTO dbstudio_e2e_child VALUES (1, 'a', 1)");

	const cases = {
		foreignKey: { id: 2, name: "b", parent_id: 999 },
		duplicateKey: { id: 1, name: "b", parent_id: 1 },
		notNull: { id: 3, name: null, parent_id: 1 },
	};
	for (const [label, data] of Object.entries(cases)) {
		evidence[label] = await addRecord(data);
	}
	evidence.valid = await addRecord({ id: 4, name: "d", parent_id: 1 });

	for (const label of Object.keys(cases)) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 409, `${label}: ${JSON.stringify(body)}`);
	}
	assert.equal((evidence.valid as { status: number }).status, 200);
	console.log("PASS PostgreSQL constraint violations on insert answer 409");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-constraint-violation.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await pool.query("DROP TABLE IF EXISTS dbstudio_e2e_child, dbstudio_e2e_parent");
	await pool.end();
}
