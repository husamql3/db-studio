import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { databaseName, inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-J: a role without the privilege it needs (no INSERT or
// SELECT grant, or a row-level security policy that refuses the row) got 500 for PostgreSQL's
// 42501 and the error went to Sentry, though the user's role caused it. Writes and reads must
// answer 403 with the driver's message, which names the table or policy. DATABASE_URL must
// be a superuser's.
const { url: databaseUrl } = requireDatabaseUrl("pg");
const db = databaseName(databaseUrl);

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
	const app = await inProcessApp(limitedUrl.toString());

	const call = async (method: string, route: string, body?: unknown) => {
		const response = await app.call(method, route, body);
		const { requestId: _requestId, ...json } = response.body as Record<string, unknown>;

		return { status: response.status, body: json };
	};

	const insert = (tableName: string) =>
		call("POST", "/records", { tableName, data: { id: 1, name: "a" } });

	const read = (tableName: string) => call("GET", `/tables/${tableName}/data?limit=50`);

	evidence.insertWithoutGrant = await insert("dbstudio_e2e_private");
	evidence.readWithoutGrant = await read("dbstudio_e2e_private");
	evidence.insertRefusedByPolicy = await insert("dbstudio_e2e_rls");
	evidence.readAllowedByPolicy = await read("dbstudio_e2e_rls");
	await app.close();

	for (const label of ["insertWithoutGrant", "readWithoutGrant", "insertRefusedByPolicy"]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 403, `${label}: ${JSON.stringify(body)}`);
	}

	assert.equal((evidence.readAllowedByPolicy as { status: number }).status, 200);
	console.log("PASS PostgreSQL permission errors answer 403");
} finally {
	try {
		await writeArtifact("pg-permission-denied.json", evidence);
	} finally {
		await cleanup().finally(() => admin.end());
	}
}
