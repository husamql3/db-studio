import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

// Regression for DB-STUDIO-SERVER-J: a role without the privilege it needs (no INSERT or
// SELECT grant, or a row-level security policy that refuses the row) got 500 for PostgreSQL's
// 42501 and the error went to Sentry, though the user's role caused it. Writes and reads must
// answer 403 with the driver's message, which names the table or policy.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database (superuser)");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
// Roles are cluster-wide: a per-run name means cleanup never drops a role this run did not create.
const ROLE = `dbstudio_e2e_limited_${randomUUID().slice(0, 8)}`;
const admin = new pg.Pool({ connectionString: databaseUrl });
const evidence: Record<string, unknown> = {};

const cleanup = async () => {
	await admin.query("DROP TABLE IF EXISTS dbstudio_e2e_private, dbstudio_e2e_rls");
	await admin.query(
		`DO $$ BEGIN
			IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
				EXECUTE 'DROP OWNED BY ${ROLE}';
				EXECUTE 'DROP ROLE ${ROLE}';
			END IF;
		END $$`,
	);
};

try {
	await cleanup();
	await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD 'e2e'`);
	await admin.query(`GRANT CONNECT ON DATABASE "${db}" TO ${ROLE}`);
	await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
	// No grant at all on this one.
	await admin.query("CREATE TABLE dbstudio_e2e_private (id INT PRIMARY KEY, name TEXT)");
	// Readable and insertable, but row-level security lets the role read rows, not add them.
	await admin.query("CREATE TABLE dbstudio_e2e_rls (id INT PRIMARY KEY, name TEXT)");
	await admin.query("ALTER TABLE dbstudio_e2e_rls ENABLE ROW LEVEL SECURITY");
	await admin.query("CREATE POLICY read_all ON dbstudio_e2e_rls FOR SELECT USING (true)");
	await admin.query(`GRANT SELECT, INSERT ON dbstudio_e2e_rls TO ${ROLE}`);

	const limitedUrl = new URL(databaseUrl);
	limitedUrl.username = ROLE;
	limitedUrl.password = "e2e";
	const { createServer } = await import("../src/utils/create-server.js");
	const { connect } = await import("../src/connection.js");
	const { getDbPool } = await import("../src/db-manager.js");
	const { app } = createServer();
	await connect(limitedUrl.toString());

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
	const params = new URLSearchParams({ db });
	const insert = (tableName: string) =>
		call("POST", `/records?${params}`, { tableName, data: { id: 1, name: "a" } });
	const read = (tableName: string) =>
		call("GET", `/tables/${tableName}/data?${new URLSearchParams({ db, limit: "50" })}`);

	evidence.insertWithoutGrant = await insert("dbstudio_e2e_private");
	evidence.readWithoutGrant = await read("dbstudio_e2e_private");
	evidence.insertRefusedByPolicy = await insert("dbstudio_e2e_rls");
	evidence.readAllowedByPolicy = await read("dbstudio_e2e_rls");
	await (await getDbPool(db)).end();

	for (const label of ["insertWithoutGrant", "readWithoutGrant", "insertRefusedByPolicy"]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 403, `${label}: ${JSON.stringify(body)}`);
	}
	assert.equal((evidence.readAllowedByPolicy as { status: number }).status, 200);
	console.log("PASS PostgreSQL permission errors answer 403");
} finally {
	try {
		await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
		await writeFile(
			new URL("./artifacts/pg-permission-denied.json", import.meta.url),
			`${JSON.stringify(evidence, null, 2)}\n`,
		);
	} finally {
		await cleanup().finally(() => admin.end());
	}
}
