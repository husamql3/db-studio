import assert from "node:assert/strict";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// Regression for DB-STUDIO-SERVER-S (and K): a value PostgreSQL cannot read as the column's type
// (a malformed date, text in an integer column, a string past varchar's length) raises a class 22
// "data exception". It answered 500 and went to Sentry, though the user's input caused it, on both
// inserts and grid filters. It must answer 400 with the driver's message, which names the value.
const app = await inProcessApp(requireDatabaseUrl("pg").url);
const evidence: Record<string, unknown> = {};
const TABLE = "dbstudio_e2e_typed";

const call = async (method: string, route: string, body?: unknown) => {
	const response = await app.call(method, route, body);
	const { requestId: _requestId, ...json } = response.body as Record<string, unknown>;

	return { status: response.status, body: json };
};

try {
	await app.query(`DROP TABLE IF EXISTS ${TABLE}`);
	await app.query(`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, born DATE, code VARCHAR(3))`);

	const insert = (data: Record<string, unknown>) =>
		call("POST", "/records", { tableName: TABLE, data });

	evidence.badDate = await insert({ id: 1, born: "29/10/2026", code: "a" });
	evidence.textInInteger = await insert({ id: "one", born: "2026-10-29", code: "a" });
	evidence.tooLong = await insert({ id: 2, born: "2026-10-29", code: "abcd" });
	evidence.valid = await insert({ id: 3, born: "2026-10-29", code: "abc" });
	// Editing a cell and bulk-inserting rows go through their own catch blocks in the adapter.
	evidence.updateBadDate = await call("PATCH", "/records", {
		tableName: TABLE,
		primaryKey: "id",
		updates: [{ rowData: { id: 3 }, columnName: "born", value: "29/10/2026" }],
	});
	evidence.bulkTooLong = await call("POST", "/records/bulk", {
		tableName: TABLE,
		records: [{ id: 4, born: "2026-10-29", code: "abcd" }],
	});
	const filters = JSON.stringify([{ columnName: "id", operator: "=", value: "one" }]);
	evidence.filterTextOnInteger = await call(
		"GET",
		`/tables/${TABLE}/data?${new URLSearchParams({ limit: "50", filters })}`,
	);

	for (const label of [
		"badDate",
		"textInInteger",
		"tooLong",
		"updateBadDate",
		"bulkTooLong",
		"filterTextOnInteger",
	]) {
		const { status, body } = evidence[label] as { status: number; body: unknown };
		assert.equal(status, 400, `${label}: ${JSON.stringify(body)}`);
	}

	assert.equal((evidence.valid as { status: number }).status, 200);
	console.log("PASS PostgreSQL data exceptions answer 400");
} finally {
	await writeArtifact("pg-invalid-data.json", evidence);
	await app.query(`DROP TABLE IF EXISTS ${TABLE}`);
	await app.close();
}
