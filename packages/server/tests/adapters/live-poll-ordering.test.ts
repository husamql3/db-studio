/**
 * Live mode re-runs getTableData() every second and diffs consecutive pages by primary key.
 * That only works when a page's rows come back in the same order on every poll. These tests
 * run each SQL adapter against a real engine and check the ways that can break:
 *
 * 1. An unsorted page falls back to physical order (SQL Server heaps use `ORDER BY (SELECT
 *    NULL)`), so rows are not in key order and can shift between polls.
 * 2. A sort on a non-unique column leaves ties in index order. Editing an unsorted column then
 *    moves rows between polls, and live mode highlights rows that were never inserted.
 * 3. The keyset cursor compares `(sort, pk)` tuples. If ORDER BY omits the key, the next page
 *    repeats or skips rows.
 * 4. The backward (`direction: "desc"`) query must flip the tie-breaker too. Otherwise paging
 *    back does not return the page the user came from.
 *
 * SQLite and DuckDB run on temporary files on every test run. The server engines
 * (PostgreSQL, MySQL, SQL Server, Oracle) run the same checks in e2e/live-poll-ordering.ts.
 */
import type { SortType } from "@db-studio/shared/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";
import { openEngine } from "../engine.js";

const TABLE = "live_poll_items";
const INSERT_ORDER = [3, 1, 5, 2, 4];
const rankOf = (id: number) => 10 - id;

const engines = [
	{
		name: "sqlite",
		adapter: new SqliteAdapter(),
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name TEXT NOT NULL)`,
			`CREATE INDEX ${TABLE}_grp_rnk ON ${TABLE} (grp, rnk)`,
		],
	},
	{
		name: "duckdb",
		adapter: new DuckDbAdapter(),
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name VARCHAR NOT NULL)`,
		],
	},
] as const satisfies { name: "sqlite" | "duckdb"; adapter: IDbAdapter; schema: string[] }[];

const bySharedGroup: SortType[] = [{ columnName: "grp", direction: "asc" }];

for (const engine of engines) {
	describe(`${engine.name} live polling`, () => {
		const { adapter } = engine;
		const ids = (rows: Record<string, unknown>[]) => rows.map((row) => Number(row.id));

		const page = (
			params: Omit<Parameters<IDbAdapter["getTableData"]>[0], "tableName" | "db">,
		) => adapter.getTableData({ tableName: TABLE, db: "", ...params });

		let opened: Awaited<ReturnType<typeof openEngine>>;

		beforeAll(async () => {
			opened = await openEngine(engine.name);
		});

		afterAll(() => opened.close());

		beforeEach(async () => {
			await opened.exec(...engine.schema);

			for (const id of INSERT_ORDER) {
				await opened.exec(
					`INSERT INTO ${TABLE} (id, grp, rnk, name) VALUES (${id}, 1, ${rankOf(id)}, 'row ${id}')`,
				);
			}
		});

		it("returns an unsorted page in primary-key order", async () => {
			const { data } = await page({ limit: 3 });
			expect(ids(data)).toEqual([1, 2, 3]);
		});

		it("breaks ties in a non-unique sort by primary key", async () => {
			const { data } = await page({ sort: bySharedGroup, limit: 3 });
			expect(ids(data)).toEqual([1, 2, 3]);
		});

		it("keeps rows in place when an unsorted column changes between polls", async () => {
			const before = await page({ sort: bySharedGroup, limit: 3 });
			await opened.exec(`UPDATE ${TABLE} SET rnk = 99, name = 'edited' WHERE id IN (1, 5)`);
			const after = await page({ sort: bySharedGroup, limit: 3 });

			expect(ids(after.data)).toEqual(ids(before.data));
			expect(after.data.find((row) => Number(row.id) === 1)?.name).toBe("edited");
		});

		it("pages through tied rows without repeating or skipping any", async () => {
			const first = await page({ sort: bySharedGroup, limit: 2 });

			const second = await page({
				sort: bySharedGroup,
				limit: 2,
				cursor: first.meta.nextCursor as string,
			});

			const third = await page({
				sort: bySharedGroup,
				limit: 2,
				cursor: second.meta.nextCursor as string,
			});

			expect([...ids(first.data), ...ids(second.data), ...ids(third.data)]).toEqual([
				1, 2, 3, 4, 5,
			]);
			expect(third.meta.hasNextPage).toBe(false);
		});

		it("pages back to the same rows it came from", async () => {
			const first = await page({ sort: bySharedGroup, limit: 2 });

			const second = await page({
				sort: bySharedGroup,
				limit: 2,
				cursor: first.meta.nextCursor as string,
			});

			const back = await page({
				sort: bySharedGroup,
				limit: 2,
				cursor: second.meta.prevCursor as string,
				direction: "desc",
			});

			expect(ids(back.data)).toEqual(ids(first.data));
		});

		it("breaks ties in the sort's direction when sorting descending", async () => {
			const { data } = await page({
				sort: [{ columnName: "grp", direction: "desc" }],
				limit: 3,
			});

			expect(ids(data)).toEqual([5, 4, 3]);
		});
	});
}

// A sorted table without a key has no tie-breaker: a keyset cursor on the tied sort column
// alone skipped every row after the first page.
describe("sqlite sorted table without a key", () => {
	const adapter = new SqliteAdapter();
	let opened: Awaited<ReturnType<typeof openEngine>>;

	beforeAll(async () => {
		opened = await openEngine("sqlite");
		await opened.exec(
			"DROP TABLE IF EXISTS keyless_items",
			"CREATE TABLE keyless_items (id INTEGER NOT NULL, grp INTEGER NOT NULL)",
			"INSERT INTO keyless_items VALUES (1, 1), (2, 1), (3, 1), (4, 1), (5, 1)",
		);
	});

	afterAll(() => opened.close());

	it("pages through every tied row", async () => {
		const seen: number[] = [];
		let cursor: string | undefined;

		for (let i = 0; i < 3; i++) {
			const { data, meta } = await adapter.getTableData({
				tableName: "keyless_items",
				db: "",
				sort: bySharedGroup,
				limit: 2,
				cursor,
			});

			seen.push(...data.map((row) => Number(row.id)));
			cursor = meta.nextCursor ?? undefined;
		}

		expect(seen.toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
		expect(cursor).toBeUndefined();
	});
});
