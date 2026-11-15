import assert from "node:assert/strict";
import { tableDataResultSchema } from "@db-studio/shared/types";
import { z } from "zod";
import { inProcessApp, requireDatabaseUrl, writeArtifact } from "./lib.js";

// A table without a primary key pages by its physical row location (ctid) as the tie-breaker:
// rows that share a sort value must each appear once, forward and backward, and the location
// must not reach the rows the grid shows.
const { call, close, query } = await inProcessApp(requireDatabaseUrl("pg").url);
const table = "dbstudio_no_key_paging";
const evidence: Record<string, unknown> = {};
const pageSchema = z.object({ data: tableDataResultSchema });

const page = async (name: string, order: string, cursor?: string, direction = "asc") => {
	const params = new URLSearchParams({ limit: "2", sort: "label", order, direction });

	if (cursor) params.set("cursor", cursor);

	const { status, body } = await call("GET", `/tables/${table}/data?${params}`);

	// Cursor values contain physical tuple locations; retain visible rows and flags only.
	if (status !== 200) {
		evidence[name] = { status, body };
		assert.fail(`${name}: ${JSON.stringify(body)}`);
	}

	const result = pageSchema.parse(body).data;
	evidence[name] = {
		status,
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
	await writeArtifact("pg-no-key-pagination.json", evidence);
	await query(`DROP TABLE IF EXISTS ${table}`);
	await close();
}
