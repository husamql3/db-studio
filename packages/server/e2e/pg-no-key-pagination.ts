import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tableDataResultSchema } from "@db-studio/shared/types";
import { z } from "zod";

process.env.DB_STUDIO_TELEMETRY = "0";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.startsWith("postgresql://")) {
	throw new Error("Set DATABASE_URL to a disposable PostgreSQL database");
}
const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
const { createServer } = await import("../src/utils/create-server.js");
const { getDbPool } = await import("../src/db-manager.js");
const { app } = createServer();
const table = "dbstudio_no_key_paging";
const evidence: Record<string, unknown> = {};
const pageSchema = z.object({ data: tableDataResultSchema });

const query = async (sql: string) => {
	const response = await app.request(`/api/pg/query?db=${encodeURIComponent(db)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: sql }),
	});
	assert.equal(response.status, 200, await response.text());
};

const page = async (name: string, order: string, cursor?: string, direction = "asc") => {
	const params = new URLSearchParams({ db, limit: "2", sort: "label", order, direction });
	if (cursor) params.set("cursor", cursor);
	const response = await app.request(`/api/pg/tables/${table}/data?${params}`);
	const body: unknown = await response.json();
	// Cursor values contain physical tuple locations; retain visible rows and flags only.
	if (response.status !== 200) {
		evidence[name] = { status: response.status, body };
		assert.fail(`${name}: ${JSON.stringify(body)}`);
	}
	const result = pageSchema.parse(body).data;
	evidence[name] = {
		status: response.status,
		rows: result.data,
		hasNextPage: result.meta.hasNextPage,
		hasPreviousPage: result.meta.hasPreviousPage,
	};
	return result;
};

try {
	await query(`DROP TABLE IF EXISTS ${table}`);
	await query(`CREATE TABLE ${table} (label TEXT, marker INTEGER)`);
	await query(`INSERT INTO ${table} VALUES ('same', 1), ('same', 2), ('same', 3), ('z', 4)`);
	for (const order of ["asc", "desc"]) {
		const first = await page(`${order}: first`, order);
		assert.ok(first.meta.nextCursor);
		const second = await page(`${order}: second`, order, first.meta.nextCursor);
		assert.deepEqual(
			[...first.data, ...second.data].map((row) => row.marker),
			order === "asc" ? [1, 2, 3, 4] : [4, 3, 2, 1],
		);
		assert.equal(second.meta.hasNextPage, false);
		assert.ok(second.meta.prevCursor);
		const previous = await page(`${order}: previous`, order, second.meta.prevCursor, "desc");
		assert.deepEqual(previous.data, first.data);
		assert.ok(first.data.every((row) => !("ctid" in row)));
	}
	console.log("PASS PostgreSQL no-key sorting and forward/backward pagination");
} finally {
	await mkdir(new URL("./artifacts/", import.meta.url), { recursive: true });
	await writeFile(
		new URL("./artifacts/pg-no-key-pagination.json", import.meta.url),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	await query(`DROP TABLE IF EXISTS ${table}`);
	await getDbPool(db).end();
}
