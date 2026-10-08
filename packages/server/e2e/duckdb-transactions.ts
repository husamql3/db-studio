import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

process.env.DATABASE_URL = "duckdb://:memory:";
process.env.DB_STUDIO_TELEMETRY = "0";
const { createServer } = await import("../src/utils/create-server.js");
const { withDuckdbConnection } = await import("../src/db-manager.js");
const { app } = createServer();
const rowsSchema = z.object({
	data: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
});
const evidence: Record<string, unknown> = {};

const request = async (resource: string, body: unknown) => {
	const response = await app.request(`/api/duckdb/${resource}?db=memory`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const result: unknown = await response.json();
	return { status: response.status, body: result };
};
const query = (sql: string) => request("query", { query: sql });
const rows = async () =>
	rowsSchema.parse((await query("SELECT * FROM tx_guard ORDER BY id")).body).data.rows;

try {
	assert.equal(
		(await query("CREATE TABLE tx_guard (id INTEGER PRIMARY KEY, label VARCHAR)")).status,
		200,
	);
	const begin = await query("BEGIN");
	const inserted = await request("records", {
		tableName: "tx_guard",
		data: { id: 1, label: "saved" },
	});
	const beforeRollback = await rows();
	const rollback = await query("ROLLBACK");
	const afterRollback = await rows();
	evidence.gridInsert = {
		beginStatus: begin.status,
		insertStatus: inserted.status,
		beforeRollback,
		rollbackStatus: rollback.status,
		afterRollback,
	};

	const rejected: Array<{ sql: string; status: number }> = [];
	for (const sql of [
		"/* outer /* nested */ comment */ START TRANSACTION; -- trailing",
		"COMMIT",
		"END",
		"ABORT",
		"ROLLBACK",
		"INSERT INTO tx_guard VALUES (2, 'batch'); BEGIN",
		"BEGIN; INSERT INTO tx_guard VALUES (3, 'batch'); COMMIT",
	]) {
		const result = await query(sql);
		rejected.push({ sql, status: result.status });
		// Reset leaked transactions on the broken version so every regression can be observed.
		await withDuckdbConnection((conn) => conn.run("ROLLBACK").catch(() => {}));
	}
	evidence.rejected = rejected;
	const allowed = await query("SELECT $$BEGIN; COMMIT$$ AS text; /* ignored ; */");
	evidence.quotedText = {
		status: allowed.status,
		rows: rowsSchema.parse(allowed.body).data.rows,
	};
	evidence.finalRows = await rows();

	assert.equal(begin.status, 400);
	assert.equal(inserted.status, 200);
	assert.equal(rollback.status, 400);
	assert.deepEqual(afterRollback, [{ id: 1, label: "saved" }]);
	assert.ok(rejected.every((result) => result.status === 400));
	assert.equal(allowed.status, 200);
	assert.deepEqual(evidence.finalRows, [{ id: 1, label: "saved" }]);
	console.log(
		"PASS DuckDB runner requests cannot roll back grid writes or partly run batches",
	);
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/duckdb-transactions.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
