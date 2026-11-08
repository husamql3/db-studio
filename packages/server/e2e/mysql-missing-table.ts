import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-T: opening a MySQL table that does not exist (a stale
// /table/<name> URL after switching databases, or a dropped table) answered 500
// ER_NO_SUCH_TABLE and was reported to Sentry. It must answer 404, as PostgreSQL and SQLite do.
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("mysql://")) {
	throw new Error("Set DATABASE_URL to a disposable MySQL database (bun run init-db:mysql)");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { connect } = await import("../src/connection.js");
const { app } = createServer();
await connect(databaseUrl);
const evidence: Record<string, unknown> = {};

const tableData = async (tableName: string) => {
	const params = new URLSearchParams({ db, limit: "50" });
	const response = await app.handle(
		new Request(
			new URL(
				`/api/mysql/tables/${encodeURIComponent(tableName)}/data?${params}`,
				"http://localhost",
			),
		),
	);
	const { requestId: _requestId, ...body } = (await response.json()) as Record<
		string,
		unknown
	>;
	return { status: response.status, body };
};

try {
	evidence.missingTable = await tableData("device_keys");
	const { status, body } = evidence.missingTable as { status: number; body: unknown };
	assert.equal(status, 404, JSON.stringify(body));
	console.log("PASS MySQL missing table answers 404");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/mysql-missing-table.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
process.exit(0);
