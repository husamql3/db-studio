import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { indexInfoSchema } from "@db-studio/shared/types";
import { z } from "zod";

// Regressions: columnstore columns must not disappear as INCLUDE columns; SQL comments
// must not shift SQLite expression keys, while quoted comment markers remain literal.
// MySQL unique keys and unique indexes must retain uniqueness after refused API drops.
process.env.DB_STUDIO_TELEMETRY = "0";
const { getDbType } = await import("../src/db-manager.js");
const engine = getDbType();
assert.ok(
	engine === "mssql" || engine === "sqlite" || engine === "mysql",
	"Use a disposable MSSQL, SQLite or MySQL DB",
);
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "Set DATABASE_URL");
const db = engine === "sqlite" ? "main" : new URL(databaseUrl).pathname.slice(1);
const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const table = "dbstudio_e2e_index_listing";
const evidence: Record<string, unknown> = {};
const listSchema = z.object({ data: z.array(indexInfoSchema) });

const query = async (sql: string) => {
	const response = await app.handle(
		new Request(
			new URL(`/api/${engine}/query?db=${encodeURIComponent(db)}`, "http://localhost"),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: sql }),
			},
		),
	);
	assert.equal(response.status, 200, await response.text());
};

try {
	await query(`DROP TABLE IF EXISTS ${table}`);
	await query(
		engine === "mysql"
			? `CREATE TABLE ${table} (a INT PRIMARY KEY, b INT, UNIQUE KEY e2e_unique_key (b))`
			: `CREATE TABLE ${table} (a INT, b INT)`,
	);
	if (engine === "mssql") {
		await query(`CREATE NONCLUSTERED COLUMNSTORE INDEX e2e_columnstore ON ${table} (b, a)`);
		await query(`CREATE INDEX e2e_covering ON ${table} (b) INCLUDE (a)`);
	} else if (engine === "mysql") {
		await query(`CREATE UNIQUE INDEX e2e_unique_index ON ${table} (a, b)`);
		await query(`CREATE INDEX e2e_ordinary ON ${table} (b, a)`);
	} else {
		await query(`CREATE INDEX e2e_block_comment ON ${table} (a /* comma, ) here */, abs(b))`);
		await query(`CREATE INDEX e2e_line_comment ON ${table} (a -- comma, ) here\n, abs(b))`);
		await query(`CREATE INDEX e2e_quoted_marker ON ${table} (a, instr('it''s /* , ) --', b))`);
	}
	const response = await app.handle(
		new Request(
			new URL(
				`/api/${engine}/tables/${table}/indexes?db=${encodeURIComponent(db)}`,
				"http://localhost",
			),
		),
	);
	assert.equal(response.status, 200);
	const indexes = listSchema.parse(await response.json()).data;
	evidence.indexes = indexes;
	const columns = (name: string) => indexes.find((index) => index.indexName === name)?.columns;
	if (engine === "mssql") {
		assert.deepEqual(columns("e2e_columnstore")?.toSorted(), ["a", "b"]);
		assert.deepEqual(columns("e2e_covering"), ["b"]);
	} else if (engine === "mysql") {
		for (const indexName of ["PRIMARY", "e2e_unique_key", "e2e_unique_index"]) {
			const drop = await app.handle(
				new Request(
					new URL(
						`/api/${engine}/tables/${table}/indexes/${indexName}?db=${encodeURIComponent(db)}`,
						"http://localhost",
					),
					{ method: "DELETE" },
				),
			);
			evidence[`drop_${indexName}`] = drop.status;
			assert.equal(drop.status, 400, `${indexName} must be protected`);
			assert.equal(
				indexes.find((index) => index.indexName === indexName)?.kind,
				indexName === "PRIMARY" ? "primary" : "unique-constraint",
			);
		}
		const drop = await app.handle(
			new Request(
				new URL(
					`/api/${engine}/tables/${table}/indexes/e2e_ordinary?db=${encodeURIComponent(db)}`,
					"http://localhost",
				),
				{ method: "DELETE" },
			),
		);
		assert.equal(drop.status, 200);
		await query(`INSERT INTO ${table} VALUES (1, 7)`);
		const duplicate = await app.handle(
			new Request(
				new URL(`/api/${engine}/query?db=${encodeURIComponent(db)}`, "http://localhost"),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: `INSERT INTO ${table} VALUES (2, 7)` }),
				},
			),
		);
		assert.ok(duplicate.status >= 400, "uniqueness must still be enforced");
		evidence.uniquenessPreserved = true;
		evidence.ordinaryDropStatus = drop.status;
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
