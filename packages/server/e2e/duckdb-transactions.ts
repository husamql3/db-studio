import assert from "node:assert/strict";
import { inProcessApp, writeArtifact } from "./lib.js";

// DuckDB shares one connection per database, so a transaction statement sent from the query
// runner would roll back or commit the grid's writes. The runner must refuse every transaction
// statement, alone or inside a batch, and still run quoted text that only looks like one.
// Runs on an in-memory database.
const { call, close, query } = await inProcessApp("duckdb://:memory:");
const { connector } = await import("../src/open-connections.js");
const evidence: Record<string, unknown> = {};

const run = (sql: string) => call("POST", "/query", { query: sql });
const rows = () => query("SELECT * FROM tx_guard ORDER BY id");

try {
	await query("CREATE TABLE tx_guard (id INTEGER PRIMARY KEY, label VARCHAR)");
	const begin = await run("BEGIN");

	const inserted = await call("POST", "/records", {
		tableName: "tx_guard",
		data: { id: 1, label: "saved" },
	});

	const beforeRollback = await rows();
	const rollback = await run("ROLLBACK");
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
		const result = await run(sql);
		rejected.push({ sql, status: result.status });
		// Reset leaked transactions on the broken version so every regression can be observed.
		await connector("duckdb").withConnection((conn) => conn.run("ROLLBACK").catch(() => {}));
	}

	evidence.rejected = rejected;
	evidence.quotedText = {
		rows: await query("SELECT $$BEGIN; COMMIT$$ AS text; /* ignored ; */"),
	};
	evidence.finalRows = await rows();

	assert.equal(begin.status, 400);
	assert.equal(inserted.status, 200);
	assert.equal(rollback.status, 400);
	assert.deepEqual(afterRollback, [{ id: 1, label: "saved" }]);
	assert.ok(rejected.every((result) => result.status === 400));
	assert.deepEqual(evidence.finalRows, [{ id: 1, label: "saved" }]);
	console.log(
		"PASS DuckDB runner requests cannot roll back grid writes or partly run batches",
	);
} finally {
	await writeArtifact("duckdb-transactions.json", evidence);
	await close();
}
