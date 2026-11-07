import assert from "node:assert/strict";
import { inProcessApp, normalize, writeArtifact } from "./lib.js";

// DuckDB cannot delete a parent and its children in one atomic transaction, so a force delete
// of a row other rows reference must refuse before it writes anything. Runs on an in-memory
// database.
const { call, close, query } = await inProcessApp("duckdb://:memory:");

const forceDelete = (id: number) =>
	call("DELETE", "/records/force", {
		tableName: "dbstudio_force_parent",
		primaryKeys: [{ columnName: "id", value: id }],
	});

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

await writeArtifact(
	"duckdb-force-delete.json",
	normalize(
		{ dependentDelete, afterRefusal, independentDelete, finalRows },
		{ keys: ["requestId"] },
	),
);

await close();

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
