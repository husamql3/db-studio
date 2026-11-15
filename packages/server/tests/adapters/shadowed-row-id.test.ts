/**
 * A table without a primary key pages by its hidden row id (SQLite `rowid`, DuckDB `rowid`).
 * A table may define its own column of that name. Failure modes:
 * - the page strips the user's `rowid` column from every row, mistaking it for the hidden id
 * - the keyset orders by the user's column instead of the hidden id, so a page boundary
 *   between rows with equal values repeats or skips rows
 * - with every hidden alias shadowed (SQLite `rowid`, `_rowid_`, `oid`), paging breaks instead
 *   of falling back to OFFSET
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";
import { openEngine } from "../engine.js";

const engines = [
	{ engine: "sqlite", db: "main", adapter: new SqliteAdapter() },
	{ engine: "duckdb", db: "scratch", adapter: new DuckDbAdapter() },
] as const satisfies { engine: string; db: string; adapter: IDbAdapter }[];

// Duplicate names, so the order depends on the tie-breaker; a page of 2 splits each pair.
const ROWS = [
	{ rowid: "r1", name: "A" },
	{ rowid: "r2", name: "A" },
	{ rowid: "r3", name: "B" },
	{ rowid: "r4", name: "B" },
	{ rowid: "r5", name: "C" },
];

const values = (rows: typeof ROWS, extra = "") =>
	rows.map((r) => `('${r.rowid}', '${r.name}'${extra})`).join(", ");

const readAll = async (adapter: IDbAdapter, db: string, tableName: string) => {
	const seen: Record<string, unknown>[] = [];
	let cursor: string | undefined;

	for (let i = 0; i < 10; i++) {
		const { data, meta } = await adapter.getTableData({
			db,
			tableName,
			limit: 2,
			sort: [{ columnName: "name", direction: "asc" }],
			cursor,
		});

		seen.push(...data);

		if (!meta.nextCursor) return seen;
		cursor = meta.nextCursor;
	}

	throw new Error("paging did not end");
};

for (const { engine, db, adapter } of engines) {
	describe(`${engine} table with its own rowid column`, () => {
		let opened: Awaited<ReturnType<typeof openEngine>>;

		beforeAll(async () => {
			opened = await openEngine(engine);
			await opened.exec(
				"CREATE TABLE own_rowid (rowid TEXT, name TEXT)",
				`INSERT INTO own_rowid VALUES ${values(ROWS)}`,
			);
		});

		afterAll(() => opened.close());

		it("returns the user's rowid values and every row once across pages", async () => {
			const rows = await readAll(adapter, db, "own_rowid");

			expect(rows.map((r) => r.name)).toEqual(["A", "A", "B", "B", "C"]);
			expect(rows.map((r) => r.rowid).sort()).toEqual(["r1", "r2", "r3", "r4", "r5"]);

			for (const row of rows) expect(Object.keys(row).sort()).toEqual(["name", "rowid"]);
		});
	});
}

describe("sqlite table shadowing rowid, _rowid_ and oid", () => {
	const adapter = new SqliteAdapter();
	let opened: Awaited<ReturnType<typeof openEngine>>;

	beforeAll(async () => {
		opened = await openEngine("sqlite");
		await opened.exec(
			"CREATE TABLE all_shadowed (rowid TEXT, name TEXT, _rowid_ TEXT, oid TEXT)",
			`INSERT INTO all_shadowed VALUES ${values(ROWS, ", 'x', 'y'")}`,
		);
	});

	afterAll(() => opened.close());

	it("pages every row once with its own columns", async () => {
		const rows = await readAll(adapter, "main", "all_shadowed");

		expect(rows.map((r) => r.name)).toEqual(["A", "A", "B", "B", "C"]);
		expect(rows.map((r) => r.rowid).sort()).toEqual(["r1", "r2", "r3", "r4", "r5"]);
		expect(rows.every((r) => r._rowid_ === "x" && r.oid === "y")).toBe(true);
	});
});
