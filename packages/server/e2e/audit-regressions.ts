import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tableDataResultSchema } from "@db-studio/shared/types";
import { z } from "zod";

process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL ?? "";
const dbType = databaseUrl.startsWith("postgresql://")
	? "pg"
	: databaseUrl.startsWith("mysql://")
		? "mysql"
		: null;
if (!dbType) throw new Error("Set DATABASE_URL to a disposable PostgreSQL or MySQL database");
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

const { DatabaseManager, openConnection, closeAllDbPools } = await import(
	"../src/db-manager.js"
);
openConnection("e2e", new DatabaseManager(databaseUrl));
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const evidence: Record<string, unknown> = {};
const rowsSchema = z.object({
	data: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
});
const pageSchema = z.object({ data: tableDataResultSchema });

const call = async (method: string, path: string, body?: unknown) => {
	const url = new URL(`/api/${dbType}${path}`, "http://localhost");
	url.searchParams.set("db", db);
	const response = await app.handle(
		new Request(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
	return { status: response.status, body: (await response.json()) as unknown };
};

const query = async (sql: string) => {
	const { status, body } = await call("POST", "/query", { query: sql });
	assert.equal(status, 200, JSON.stringify(body));
	return rowsSchema.parse(body).data.rows;
};

const ids = (rows: Record<string, unknown>[]) => rows.map((row) => Number(row.id));

const forceDeleteTwoForeignKeys = async () => {
	await query("DROP TABLE IF EXISTS dbstudio_audit_attachments");
	await query("DROP TABLE IF EXISTS dbstudio_audit_messages");
	await query("DROP TABLE IF EXISTS dbstudio_audit_users");
	await query("CREATE TABLE dbstudio_audit_users (id INT PRIMARY KEY)");
	await query(
		`CREATE TABLE dbstudio_audit_messages (
			id INT PRIMARY KEY, sender_id INT NOT NULL, recipient_id INT NOT NULL,
			FOREIGN KEY (sender_id) REFERENCES dbstudio_audit_users(id),
			FOREIGN KEY (recipient_id) REFERENCES dbstudio_audit_users(id))`,
	);
	await query(
		`CREATE TABLE dbstudio_audit_attachments (
			id INT PRIMARY KEY, message_id INT NOT NULL,
			FOREIGN KEY (message_id) REFERENCES dbstudio_audit_messages(id))`,
	);
	await query("INSERT INTO dbstudio_audit_users VALUES (1), (2)");
	await query("INSERT INTO dbstudio_audit_messages VALUES (1, 1, 2), (2, 2, 1)");
	await query("INSERT INTO dbstudio_audit_attachments VALUES (1, 1), (2, 2)");

	const { status } = await call("DELETE", "/records/force", {
		tableName: "dbstudio_audit_users",
		primaryKeys: [{ columnName: "id", value: 1 }],
	});
	const users = ids(await query("SELECT id FROM dbstudio_audit_users ORDER BY id"));
	const messages = await query(
		"SELECT id, sender_id, recipient_id FROM dbstudio_audit_messages ORDER BY id",
	);
	const attachments = ids(
		await query("SELECT id FROM dbstudio_audit_attachments ORDER BY id"),
	);
	evidence.forceDeleteTwoForeignKeys = { status, users, messages, attachments };
	assert.equal(status, 200);
	assert.deepEqual(users, [2]);
	// Message 2 names user 1 only as its recipient; leaving it would reference a deleted user.
	assert.deepEqual(messages, []);
	// Attachment 2 is reached only through message 2, the second relationship's row.
	assert.deepEqual(attachments, []);
};

const failedSaveRollsBack = async () => {
	await query("DROP TABLE IF EXISTS dbstudio_audit_saves");
	await query("CREATE TABLE dbstudio_audit_saves (id INT PRIMARY KEY, value TEXT)");
	await query("INSERT INTO dbstudio_audit_saves VALUES (1, 'original')");

	// More looping queries than the pool's 10 connections keep requests queued, so a connection
	// the save releases between statements goes to a queued query: statements sent through the
	// pool instead of one checked-out connection then run on different connections.
	let saving = true;
	const load = Array.from({ length: 20 }, async () => {
		while (saving) await query("SELECT pg_sleep(0.001)");
	});
	const statuses = new Set<number>();
	for (let round = 0; round < 20; round++) {
		const save = await Promise.race([
			call("PATCH", "/records", {
				tableName: "dbstudio_audit_saves",
				primaryKeys: ["id"],
				updates: [
					{ rowData: { id: 1 }, columnName: "value", value: "changed" },
					{ rowData: { id: 999 }, columnName: "value", value: "missing" },
				],
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`save ${round} hung behind a transaction left open`)),
					5000,
				).unref(),
			),
		]);
		statuses.add(save.status);
	}
	saving = false;
	await Promise.all(load);
	const rows = await query("SELECT id, value FROM dbstudio_audit_saves ORDER BY id");
	evidence.failedSaveRollsBack = { statuses: [...statuses], rows };
	assert.deepEqual([...statuses], [404]);
	assert.deepEqual(rows, [{ id: 1, value: "original" }]);
};

/** Every row once, forward one row per page, then the same rows backward. */
const walk = async (name: string, sort: string, order?: string) => {
	const page = async (direction: string, cursor?: string) => {
		const params = new URLSearchParams({ limit: "1", sort, direction });
		if (order) params.set("order", order);
		if (cursor) params.set("cursor", cursor);
		const { status, body } = await call("GET", `/tables/dbstudio_audit_paged/data?${params}`);
		assert.equal(status, 200, JSON.stringify(body));
		return pageSchema.parse(body).data;
	};

	const forward: number[] = [];
	let current = await page("asc");
	forward.push(...ids(current.data));
	while (current.meta.nextCursor) {
		current = await page("asc", current.meta.nextCursor);
		forward.push(...ids(current.data));
	}

	const backward: number[] = [];
	while (current.meta.prevCursor) {
		current = await page("desc", current.meta.prevCursor);
		backward.push(...ids(current.data));
	}

	evidence[name] = { forward, backward };
	return { forward, backward };
};

const pagingVisitsEveryRow = async () => {
	await query("DROP TABLE IF EXISTS dbstudio_audit_paged");
	await query(
		"CREATE TABLE dbstudio_audit_paged (id INT PRIMARY KEY, label TEXT, a INT, b INT)",
	);
	await query(
		"INSERT INTO dbstudio_audit_paged VALUES (1, 'a', 1, 2), (2, NULL, 1, 1), (3, NULL, 2, 1), (4, 'b', 2, 2)",
	);

	const cases = [
		{ name: "labelAscNullsLast", sort: "label", order: "asc", expected: [1, 4, 2, 3] },
		{ name: "labelDescNullsLast", sort: "label", order: "desc", expected: [4, 1, 3, 2] },
		{
			name: "aAscThenBDesc",
			sort: JSON.stringify([
				{ columnName: "a", direction: "asc" },
				{ columnName: "b", direction: "desc" },
			]),
			expected: [1, 2, 4, 3],
		},
	];
	for (const { name, sort, order, expected } of cases) {
		const { forward, backward } = await walk(name, sort, order);
		assert.deepEqual(forward, expected, name);
		assert.deepEqual(backward, expected.slice(0, -1).reverse(), `${name} backward`);
	}
};

const writeArtifact = async () => {
	await mkdir("e2e/artifacts", { recursive: true });
	await writeFile(
		`e2e/artifacts/audit-regressions-${dbType}.json`,
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
};

try {
	await forceDeleteTwoForeignKeys();
	if (dbType === "pg") {
		await failedSaveRollsBack();
		await pagingVisitsEveryRow();
	}
} catch (error) {
	await writeArtifact();
	console.error(error);
	// A hung save keeps connections busy, so cleanup could wait forever.
	process.exit(1);
}
await writeArtifact();
await query("DROP TABLE IF EXISTS dbstudio_audit_attachments");
await query("DROP TABLE IF EXISTS dbstudio_audit_messages");
for (const table of ["users", "saves", "paged"]) {
	await query(`DROP TABLE IF EXISTS dbstudio_audit_${table}`);
}
await closeAllDbPools();
console.log("PASS");
