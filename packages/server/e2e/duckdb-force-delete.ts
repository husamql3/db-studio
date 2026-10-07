import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

process.env.DATABASE_URL = "duckdb://:memory:";
process.env.DB_STUDIO_TELEMETRY = "0";

const { createServer } = await import("../src/utils/create-server.js");
const { app } = createServer();
const rowsSchema = z.object({
	data: z.object({ rows: z.array(z.record(z.string(), z.unknown())) }),
});

const query = async (sql: string) => {
	const response = await app.request("/api/duckdb/query?db=memory", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: sql }),
	});
	const body: unknown = await response.json();
	assert.equal(response.status, 200, JSON.stringify(body));
	return rowsSchema.parse(body).data.rows;
};

const forceDelete = async (id: number) => {
	const response = await app.request("/api/duckdb/records/force?db=memory", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			tableName: "dbstudio_force_parent",
			primaryKeys: [{ columnName: "id", value: id }],
		}),
	});
	const body: unknown = await response.json();
	return { status: response.status, body };
};

await query("CREATE TABLE dbstudio_force_parent (id INTEGER PRIMARY KEY)");
await query(
	"CREATE TABLE dbstudio_force_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES dbstudio_force_parent(id))",
);
await query("INSERT INTO dbstudio_force_parent VALUES (1), (2)");
await query("INSERT INTO dbstudio_force_child VALUES (11, 1)");

const dependentDelete = await forceDelete(1);
const afterRefusal = {
	parents: await query("SELECT * FROM dbstudio_force_parent ORDER BY id"),
	children: await query("SELECT * FROM dbstudio_force_child ORDER BY id"),
};
const independentDelete = await forceDelete(2);
const finalRows = {
	parents: await query("SELECT * FROM dbstudio_force_parent ORDER BY id"),
	children: await query("SELECT * FROM dbstudio_force_child ORDER BY id"),
};

const output = new URL("./artifacts/duckdb-force-delete.json", import.meta.url);
await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
await writeFile(
	output,
	`${JSON.stringify({ dependentDelete, afterRefusal, independentDelete, finalRows }, null, 2)}\n`,
);

assert.equal(dependentDelete.status, 400, "dependent force-delete must refuse before writes");
assert.deepEqual(afterRefusal, {
	parents: [{ id: 1 }, { id: 2 }],
	children: [{ id: 11, parent_id: 1 }],
});
assert.equal(independentDelete.status, 200);
assert.deepEqual(independentDelete.body, { data: { deletedCount: 1 } });
assert.deepEqual(finalRows, {
	parents: [{ id: 1 }],
	children: [{ id: 11, parent_id: 1 }],
});
console.log(
	"PASS dependent force-delete preserves all rows; independent force-delete succeeds",
);
process.exit(0);
