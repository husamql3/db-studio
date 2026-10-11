import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { indexInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";

// Regressions: columnstore columns must not disappear as INCLUDE columns; SQL comments
// must not shift SQLite expression keys, while quoted comment markers remain literal.
process.env.DB_STUDIO_TELEMETRY = "0";
const { getDbType } = await import("../src/db-manager.js");
const engine = getDbType();
assert.ok(engine === "mssql" || engine === "sqlite", "Use a disposable MSSQL or SQLite DB");
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "Set DATABASE_URL");
const db = engine === "sqlite" ? "main" : new URL(databaseUrl).pathname.slice(1);
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const table = "dbstudio_e2e_index_listing";
const evidence: Record<string, unknown> = {};
const listSchema = z.object({ data: z.array(indexInfoSchema) });

const query = async (sql: string) => {
	const response = await app.request(`/api/${engine}/query?db=${encodeURIComponent(db)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: sql }),
	});
	assert.equal(response.status, 200, await response.text());
};

try {
	await query(`DROP TABLE IF EXISTS ${table}`);
	await query(`CREATE TABLE ${table} (a INT, b INT)`);
	if (engine === "mssql") {
		await query(`CREATE NONCLUSTERED COLUMNSTORE INDEX e2e_columnstore ON ${table} (b, a)`);
		await query(`CREATE INDEX e2e_covering ON ${table} (b) INCLUDE (a)`);
	} else {
		await query(`CREATE INDEX e2e_block_comment ON ${table} (a /* comma, ) here */, abs(b))`);
		await query(`CREATE INDEX e2e_line_comment ON ${table} (a -- comma, ) here\n, abs(b))`);
		await query(`CREATE INDEX e2e_quoted_marker ON ${table} (a, instr('it''s /* , ) --', b))`);
	}
	const response = await app.request(
		`/api/${engine}/tables/${table}/indexes?db=${encodeURIComponent(db)}`,
	);
	assert.equal(response.status, 200);
	const indexes = listSchema.parse(await response.json()).data;
	evidence.indexes = indexes;
	const columns = (name: string) => indexes.find((index) => index.indexName === name)?.columns;
	if (engine === "mssql") {
		assert.deepEqual(columns("e2e_columnstore")?.toSorted(), ["a", "b"]);
		assert.deepEqual(columns("e2e_covering"), ["b"]);
	} else {
		assert.deepEqual(columns("e2e_block_comment"), ["a", "abs(b)"]);
		assert.deepEqual(columns("e2e_line_comment"), ["a", "abs(b)"]);
		assert.deepEqual(columns("e2e_quoted_marker"), ["a", "instr('it''s /* , ) --', b)"]);
	}
	console.log(`PASS ${engine} index listings`);
} finally {
	await query(`DROP TABLE IF EXISTS ${table}`);
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL(`./artifacts/${engine}-index-listing.json`, import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
}
process.exit(0);
