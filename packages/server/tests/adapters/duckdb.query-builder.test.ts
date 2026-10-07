/**
 * DuckDB keyset pagination: `buildOrderBy` orders a page and `buildKeysetPredicate` selects
 * the rows after the cursor row in that order. Ways it can fail, each run against a real
 * in-memory DuckDB:
 *
 * 1. Mixed sort directions compared as one row-value tuple `(a, b, id) > (?, ?, ?)` take every
 *    column in the first column's direction, so a column sorted the other way skips or repeats
 *    rows across pages.
 * 2. NULLs sort last, so they come after any non-NULL cursor value. `v < ?` is never true for
 *    NULL, so the page after the last non-NULL row comes back empty.
 * 3. A NULL cursor value makes every comparison NULL, so the page after a row whose sort value
 *    is NULL comes back empty instead of continuing the run of NULLs by the tie-breaker.
 * 4. After the last row of a run of NULLs nothing follows; a predicate that treats NULL as
 *    "smallest" would restart at the non-NULL rows.
 * 5. NULLs must sort last in ascending order too, and the cursor must agree with that.
 * 6. A backward page must be the exact reverse of the forward order, NULL placement included,
 *    or "previous" returns different rows than the page the user came from.
 *
 * The last block pages a seeded table through `DuckDbAdapter.getTableData` with several sort
 * specs and checks forward and backward paging against one hand-written ORDER BY query.
 */
import type { SortType } from "@db-studio/shared/types";
import { type DuckDBConnection, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const connections = vi.hoisted(() => ({ withDuckdbConnection: vi.fn() }));
vi.mock("@/adapters/connections.js", () => connections);

import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import {
	buildKeysetPredicate,
	buildOrderBy,
	type OrderTerm,
} from "@/adapters/duckdb/duckdb.query-builder.js";

let instance: DuckDBInstance;
let conn: DuckDBConnection;

const ids = async (sql: string, values: unknown[] = []) =>
	(await conn.runAndReadAll(sql, values as DuckDBValue[])).getRowObjectsJson().map((r) => Number(r.id));

beforeAll(async () => {
	instance = await DuckDBInstance.create(":memory:");
	conn = await instance.connect();
	connections.withDuckdbConnection.mockImplementation(
		(fn: (c: DuckDBConnection) => Promise<unknown>) => fn(conn),
	);
	await conn.run("CREATE TABLE mixed (id INTEGER PRIMARY KEY, a INTEGER, b INTEGER)");
	await conn.run("INSERT INTO mixed VALUES (1, 1, 3), (2, 1, 2), (3, 1, 1), (4, 2, 9)");
	await conn.run("CREATE TABLE nulls (id INTEGER PRIMARY KEY, v INTEGER)");
	await conn.run("INSERT INTO nulls VALUES (1, 5), (2, 3), (3, NULL), (4, NULL)");
});

afterAll(() => {
	conn.closeSync();
	instance.closeSync();
});

/** Ids of the `limit` rows after `cursor` (or before it, when `backward`), in display order. */
const pageAfter = async (
	table: string,
	terms: OrderTerm[],
	cursor: Record<string, unknown>,
	limit: number,
	backward = false,
) => {
	const { clause, values } = buildKeysetPredicate(terms, cursor, backward);
	const page = await ids(
		`SELECT id FROM ${table} WHERE ${clause} ${buildOrderBy(terms, backward)} LIMIT ${limit}`,
		values,
	);
	return backward ? page.reverse() : page;
};

// mixed, ordered by a ASC, b DESC, id ASC: 1 (1,3), 2 (1,2), 3 (1,1), 4 (2,9)
const aAscBDesc: OrderTerm[] = [
	{ column: "a", direction: "asc" },
	{ column: "b", direction: "desc" },
	{ column: "id", direction: "asc" },
];
// nulls, ordered by v DESC NULLS LAST, id DESC: 1 (5), 2 (3), 4 (NULL), 3 (NULL)
const vDesc: OrderTerm[] = [
	{ column: "v", direction: "desc" },
	{ column: "id", direction: "desc" },
];
// nulls, ordered by v ASC NULLS LAST, id ASC: 2 (3), 1 (5), 3 (NULL), 4 (NULL)
const vAsc: OrderTerm[] = [
	{ column: "v", direction: "asc" },
	{ column: "id", direction: "asc" },
];

describe("duckdb keyset predicate", () => {
	it("honours each column's direction when the sort mixes ASC and DESC", async () => {
		expect(await pageAfter("mixed", aAscBDesc, { a: 1, b: 2, id: 2 }, 2)).toEqual([3, 4]);
	});

	it("continues into the NULL rows after the last non-NULL value", async () => {
		expect(await pageAfter("nulls", vDesc, { v: 3, id: 2 }, 2)).toEqual([4, 3]);
	});

	it("continues a run of NULLs by the tie-breaker when the cursor value is NULL", async () => {
		expect(await pageAfter("nulls", vDesc, { v: null, id: 4 }, 2)).toEqual([3]);
	});

	it("returns nothing after the last NULL row", async () => {
		expect(await pageAfter("nulls", vDesc, { v: null, id: 3 }, 2)).toEqual([]);
	});

	it("puts NULLs last when ascending as well", async () => {
		expect(await ids(`SELECT id FROM nulls ${buildOrderBy(vAsc)}`)).toEqual([2, 1, 3, 4]);
		expect(await pageAfter("nulls", vAsc, { v: 5, id: 1 }, 2)).toEqual([3, 4]);
	});

	it("pages backward over the exact reverse of the forward order", async () => {
		expect(await pageAfter("nulls", vDesc, { v: null, id: 3 }, 2, true)).toEqual([2, 4]);
		expect(await pageAfter("nulls", vDesc, { v: null, id: 4 }, 5, true)).toEqual([1, 2]);
		expect(await pageAfter("nulls", vDesc, { v: 3, id: 2 }, 5, true)).toEqual([1]);
		expect(await pageAfter("mixed", aAscBDesc, { a: 2, b: 9, id: 4 }, 2, true)).toEqual([
			2, 3,
		]);
	});
});

describe("duckdb getTableData paging", () => {
	const TABLE = "paging";
	const adapter = new DuckDbAdapter();
	const LIMIT = 4;

	beforeAll(async () => {
		await conn.run(
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER, score INTEGER, created DATE)`,
		);
		for (let i = 1; i <= 23; i++) {
			const grp = i % 4 === 0 ? "NULL" : i % 3;
			const score = i % 5 === 0 ? "NULL" : (i * 7) % 6;
			const created = i % 6 === 0 ? "NULL" : `DATE '2024-01-01' + ${i % 4}`;
			await conn.run(`INSERT INTO ${TABLE} VALUES (${i}, ${grp}, ${score}, ${created})`);
		}
	});

	// The tie-breaker (id) follows the first sort column's direction.
	const specs: Array<{ sort: SortType[]; orderBy: string }> = [
		{ sort: [], orderBy: "id ASC" },
		{ sort: [{ columnName: "grp", direction: "asc" }], orderBy: "grp ASC NULLS LAST, id ASC" },
		{
			sort: [{ columnName: "grp", direction: "desc" }],
			orderBy: "grp DESC NULLS LAST, id DESC",
		},
		{
			sort: [
				{ columnName: "grp", direction: "asc" },
				{ columnName: "score", direction: "desc" },
			],
			orderBy: "grp ASC NULLS LAST, score DESC NULLS LAST, id ASC",
		},
		{
			sort: [
				{ columnName: "created", direction: "desc" },
				{ columnName: "score", direction: "asc" },
			],
			orderBy: "created DESC NULLS LAST, score ASC NULLS LAST, id DESC",
		},
	];

	for (const { sort, orderBy } of specs) {
		it(`pages forward and back without gaps or repeats: ORDER BY ${orderBy}`, async () => {
			const expected = await ids(`SELECT id FROM ${TABLE} ORDER BY ${orderBy}`);
			const page = (cursor?: string, direction?: "asc" | "desc") =>
				adapter.getTableData({ tableName: TABLE, db: "", limit: LIMIT, sort, cursor, direction });
			const idsOf = (rows: Record<string, unknown>[]) => rows.map((row) => Number(row.id));

			const forward: number[][] = [];
			let current = await page();
			forward.push(idsOf(current.data));
			while (current.meta.nextCursor) {
				current = await page(current.meta.nextCursor);
				forward.push(idsOf(current.data));
			}
			expect(forward.flat()).toEqual(expected);
			expect(forward).toHaveLength(Math.ceil(expected.length / LIMIT));

			const backward: number[][] = [idsOf(current.data)];
			while (current.meta.prevCursor) {
				current = await page(current.meta.prevCursor, "desc");
				backward.unshift(idsOf(current.data));
			}
			expect(backward).toEqual(forward);
		});
	}
});
