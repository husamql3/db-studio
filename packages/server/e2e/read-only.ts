/**
 * Read-only connections, through the routes the web app calls, against real databases.
 *
 * Failure modes it covers:
 * - a write lands on a connection marked read-only (query runner DML or DDL);
 * - reads stop working on a read-only connection;
 * - a tab keeps writing through the connection it opened before read-only was switched on;
 * - a tab opening the connection while read-only is switched on gets a writable session;
 * - a tab whose connection the switch closed is moved onto another tab's database;
 * - switching an in-memory DuckDB database read-only closes it and loses its rows;
 * - pasting the URL of a read-only saved connection opens it read-write;
 * - switching read-only off leaves the connection unable to write;
 * - an engine without a read-only session accepts the flag and then writes anyway.
 *
 *   cd packages/server
 *   MYSQL_URL=mysql://root@127.0.0.1:3306/dbstudio bunx tsx e2e/read-only.ts
 *
 * DuckDB and SQLite run on scratch files; each other engine runs when its URL is set
 * (PG_URL, MYSQL_URL, CLICKHOUSE_URL) and only touches a table named `dbstudio_ro_probe`.
 * Writes e2e/artifacts/read-only.json; it holds no ids, paths or URLs, so reruns match.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "db-studio-read-only-"));
process.env.DB_STUDIO_CONFIG_DIR = path.join(dir, "config");
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();

const call = async (method: string, route: string, body?: unknown, connectionId?: string) => {
	const res = await app.handle(
		new Request(new URL(`/api${route}`, "http://localhost"), {
			method,
			headers: {
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
				...(connectionId ? { "X-Connection-Id": connectionId } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
	const text = await res.text();
	return { status: res.status, text, json: JSON.parse(text) };
};

type Engine = { dbType: string; url: string; db: string; supported: boolean };
const engines: Engine[] = [
	{
		dbType: "duckdb",
		url: `duckdb://${path.join(dir, "probe.duckdb")}`,
		db: "probe",
		supported: true,
	},
	{
		dbType: "sqlite",
		url: `sqlite://${path.join(dir, "probe.db")}`,
		db: "main",
		supported: false,
	},
];
for (const [env, dbType] of [
	["PG_URL", "pg"],
	["MYSQL_URL", "mysql"],
	["CLICKHOUSE_URL", "clickhouse"],
] as const) {
	const url = process.env[env];
	if (url) engines.push({ dbType, url, db: new URL(url).pathname.slice(1), supported: true });
}

const TABLE = "dbstudio_ro_probe";
const report: Record<string, Record<string, unknown>> = {};
let failures = 0;

for (const engine of engines) {
	const steps: Record<string, unknown> = {};
	report[engine.dbType] = steps;
	const query = (sql: string, connectionId: string) =>
		call("POST", `/${engine.dbType}/query?db=${engine.db}`, { query: sql }, connectionId);
	const step = async (name: string, run: () => Promise<unknown>) => {
		try {
			steps[name] = (await run()) ?? "ok";
		} catch (error) {
			failures++;
			steps[name] = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
		}
		console.log(
			`${String(steps[name]).startsWith("FAIL") ? "FAIL" : "PASS"}  ${engine.dbType}: ${name}`,
		);
	};
	const create =
		engine.dbType === "clickhouse"
			? `CREATE TABLE ${TABLE} (id Int32) ENGINE = MergeTree ORDER BY id`
			: `CREATE TABLE ${TABLE} (id INT)`;

	// Seed in read-write mode. The file engines create their file here, before the existence check.
	if (engine.dbType === "duckdb" || engine.dbType === "sqlite") {
		const seed =
			engine.dbType === "duckdb"
				? (await import("@duckdb/node-api")).DuckDBInstance.create(engine.url.slice(9))
				: null;
		if (seed) (await seed).closeSync();
		else await writeFile(engine.url.slice(9), "");
	}
	const opened = await call("POST", "/connections", { url: engine.url });
	assert.equal(opened.status, 200, opened.text);
	const savedId: string = opened.json.data.active.id;
	const rw: string = opened.json.data.active.connectionId;

	if (!engine.supported) {
		await step("refuses read-only", async () => {
			const res = await call("PATCH", `/connections/${savedId}`, { readOnly: true });
			assert.equal(res.status, 400, res.text);
			return { status: res.status, message: res.json.message ?? res.json.error };
		});
		continue;
	}

	await step("seed read-write", async () => {
		await query(`DROP TABLE IF EXISTS ${TABLE}`, rw);
		for (const sql of [create, `INSERT INTO ${TABLE} VALUES (1)`]) {
			const res = await query(sql, rw);
			assert.equal(res.status, 200, res.text);
		}
	});

	// Another tab, on an unrelated database, switches this one read-only.
	await step("switch read-only on", async () => {
		const other = path.join(dir, `other-${engine.dbType}.db`);
		await writeFile(other, "");
		const tab = await call("POST", "/connections", { url: `sqlite://${other}` });
		assert.equal(tab.status, 200, tab.text);
		const res = await call(
			"PATCH",
			`/connections/${savedId}`,
			{ readOnly: true },
			tab.json.data.active.connectionId,
		);
		assert.equal(res.status, 200, res.text);
		assert.equal(res.json.data.readOnly, true);
		return { readOnly: res.json.data.readOnly };
	});

	await step("old read-write connection is closed", async () => {
		const res = await query(`INSERT INTO ${TABLE} VALUES (2)`, rw);
		assert.equal(res.status, 409, res.text);
		return { status: res.status };
	});

	await step("tab on the closed connection is not moved to another database", async () => {
		const res = await call("GET", "/connections", undefined, rw);
		assert.equal(res.status, 200, res.text);
		assert.equal(res.json.data.active, null, res.text);
		return { active: res.json.data.active };
	});

	// Nothing of this URL is open now, so the racing open makes a new session.
	await step("connection opened during the switch cannot write", async () => {
		await call("PATCH", `/connections/${savedId}`, { readOnly: false });
		const [opening, res] = await Promise.all([
			call("POST", `/connections/${savedId}/connect`),
			call("PATCH", `/connections/${savedId}`, { readOnly: true }),
		]);
		assert.equal(res.status, 200, res.text);
		// Closed by the switch (409, or no connection at all) or opened read-only (refused),
		// depending on which request ran first.
		const id: string | undefined = opening.json.data?.active?.connectionId;
		if (id) {
			const insert = await query(`INSERT INTO ${TABLE} VALUES (2)`, id);
			assert.ok(insert.status >= 400, `wrote: ${insert.text}`);
		}
		return { wrote: false };
	});

	const reconnected = await call("POST", `/connections/${savedId}/connect`);
	const ro: string = reconnected.json.data.active.connectionId;

	await step("reads work", async () => {
		const res = await query(`SELECT COUNT(*) AS n FROM ${TABLE}`, ro);
		assert.equal(res.status, 200, res.text);
		return { status: res.status, rows: res.json.data.rows };
	});

	for (const [name, sql] of [
		["INSERT refused", `INSERT INTO ${TABLE} VALUES (3)`],
		["DDL refused", `CREATE TABLE ${TABLE}_2 (id INT)`],
	]) {
		await step(name, async () => {
			const res = await query(sql, ro);
			assert.ok(res.status >= 400, `wrote: ${res.text}`);
			return { status: res.status, mentionsReadOnly: /read.?only/i.test(res.text) };
		});
	}

	await step("pasted URL opens read-only too", async () => {
		const pasted = await call("POST", "/connections", { url: engine.url });
		const res = await query(
			`INSERT INTO ${TABLE} VALUES (4)`,
			pasted.json.data.active.connectionId,
		);
		assert.ok(res.status >= 400, `wrote: ${res.text}`);
		return { status: res.status };
	});

	await step("switch read-only off writes again", async () => {
		await call("PATCH", `/connections/${savedId}`, { readOnly: false });
		const back = await call("POST", `/connections/${savedId}/connect`);
		const id: string = back.json.data.active.connectionId;
		const res = await query(`INSERT INTO ${TABLE} VALUES (5)`, id);
		assert.equal(res.status, 200, res.text);
		const count = await query(`SELECT COUNT(*) AS n FROM ${TABLE}`, id);
		await query(`DROP TABLE ${TABLE}`, id);
		// Only the seed row and this one: none of the refused writes landed.
		return { rows: count.json.data.rows };
	});

	if (engine.dbType === "duckdb") {
		await step("in-memory database refuses read-only and keeps its rows", async () => {
			const memory = await call("POST", "/connections", { url: "duckdb://:memory:" });
			assert.equal(memory.status, 200, memory.text);
			const id: string = memory.json.data.active.connectionId;
			for (const sql of [create, `INSERT INTO ${TABLE} VALUES (1)`]) {
				const res = await query(sql, id);
				assert.equal(res.status, 200, res.text);
			}
			const res = await call("PATCH", `/connections/${memory.json.data.active.id}`, {
				readOnly: true,
			});
			assert.equal(res.status, 400, res.text);
			const count = await query(`SELECT COUNT(*) AS n FROM ${TABLE}`, id);
			assert.equal(count.status, 200, count.text);
			return { status: res.status, message: res.json.message, rows: count.json.data.rows };
		});
	}
}

const out = new URL("./artifacts/read-only.json", import.meta.url);
await mkdir(new URL(".", out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, "\t")}\n`);
await rm(dir, { recursive: true, force: true });
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
