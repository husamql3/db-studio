import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Regression for DB-STUDIO-SERVER-H: opening a SQLite table that does not exist (a stale
// /table/<name> URL after switching databases, or a dropped table) answered 500 SQLITE_ERROR
// and was reported to Sentry. It must answer 404 like PostgreSQL does (DB-STUDIO-SERVER-C).
process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("sqlite://")) {
	throw new Error("Set DATABASE_URL to a disposable SQLite file (bun run init-db:sqlite)");
}
// Saving the connection must not touch the user's ~/.dbstudio.
process.env.DB_STUDIO_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "dbstudio-e2e-"));
const { createServer } = await import("../src/utils/create-server.js");
const { connect } = await import("../src/connection.js");
const { app } = createServer();
await connect(databaseUrl);
const evidence: Record<string, unknown> = {};

const tableData = async (tableName: string) => {
	const params = new URLSearchParams({ db: "main", limit: "50" });
	const response = await app.handle(
		new Request(new URL(`/api/sqlite/tables/${tableName}/data?${params}`, "http://localhost")),
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
	console.log("PASS SQLite missing table answers 404");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/sqlite-missing-table.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
