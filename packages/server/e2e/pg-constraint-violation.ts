import assert from "node:assert/strict";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-F: adding a record that breaks a constraint (a foreign key
// pointing at no row, a duplicate primary key, a missing NOT NULL value) answered 500 and was
// reported to Sentry, though the user's data caused it. It must answer 409 with the driver's
// message, which names the constraint the user has to satisfy.
const { call, close, query } = await inProcessApp(requireDatabaseUrl("pg").url);
const evidence: Record<string, unknown> = {};

const send = async (method: string, route: string, payload: Record<string, unknown>) => {
	const { status, body } = await call(method, `/records${route}`, {
		tableName: "dbstudio_e2e_child",
		...payload,
	});

	const { requestId: _requestId, ...rest } = body as Record<string, unknown>;

	return { status, body: rest };
};

try {
	await query("DROP TABLE IF EXISTS dbstudio_e2e_child, dbstudio_e2e_parent");
	await query("CREATE TABLE dbstudio_e2e_parent (id INT PRIMARY KEY)");
	await query(
		`CREATE TABLE dbstudio_e2e_child (
			id INT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id INT REFERENCES dbstudio_e2e_parent(id)
		)`,
	);
	await query("INSERT INTO dbstudio_e2e_parent VALUES (1)");
	await query("INSERT INTO dbstudio_e2e_child VALUES (1, 'a', 1)");

	const cases = {
		foreignKey: { id: 2, name: "b", parent_id: 999 },
		duplicateKey: { id: 1, name: "b", parent_id: 1 },
		notNull: { id: 3, name: null, parent_id: 1 },
	};

	for (const [label, data] of Object.entries(cases)) {
		evidence[label] = await send("POST", "", { data });
	}

	// Updates and bulk inserts run in a transaction; its rollback must not hide the constraint error.
	evidence.updateForeignKey = await send("PATCH", "", {
		updates: [{ rowData: { id: 1 }, columnName: "parent_id", value: 999 }],
	});
	evidence.bulkDuplicateKey = await send("POST", "/bulk", {
		records: [{ id: 1, name: "b", parent_id: 1 }],
	});
	evidence.valid = await send("POST", "", { data: { id: 4, name: "d", parent_id: 1 } });

	for (const label of [...Object.keys(cases), "updateForeignKey", "bulkDuplicateKey"]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 409, `${label}: ${JSON.stringify(body)}`);
	}

	assert.equal((evidence.valid as { status: number }).status, 200);
	console.log(
		"PASS PostgreSQL constraint violations on insert, update, and bulk insert answer 409",
	);
} finally {
	await writeArtifact("pg-constraint-violation.json", evidence);
	await query("DROP TABLE IF EXISTS dbstudio_e2e_child, dbstudio_e2e_parent");
	await close();
}
