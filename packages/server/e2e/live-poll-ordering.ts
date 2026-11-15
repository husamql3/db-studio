/**
 * Live mode re-runs the table data request every second and diffs consecutive pages by primary
 * key. That only works when a page's rows come back in the same order on every poll. This runs
 * the grid's data route against a real engine and checks the ways that can break:
 *
 * 1. An unsorted page falls back to physical order (SQL Server heaps use `ORDER BY (SELECT
 *    NULL)`), so rows are not in key order and can shift between polls.
 * 2. A sort on a non-unique column leaves ties in index order. Editing an unsorted column then
 *    moves rows between polls, and live mode highlights rows that were never inserted.
 * 3. The keyset cursor compares `(sort, pk)` tuples. If ORDER BY omits the key, the next page
 *    repeats or skips rows.
 * 4. The backward (`direction: "desc"`) query must flip the tie-breaker too. Otherwise paging
 *    back does not return the page the user came from.
 * 5. SQL Server: the key of a same-named table in another schema is used as the tie-breaker.
 *
 * Rows are inserted out of key order into a heap (SQL Server, Oracle) or under an index that
 * orders them differently (MySQL, SQLite), so a missing tie-breaker shows. The vitest suite
 * runs SQLite and DuckDB on every test run; this script covers the server engines.
 *
 *   cd packages/server
 *   DATABASE_URL=mysql://root@127.0.0.1:3306/dbstudio bunx tsx e2e/live-poll-ordering.ts
 *
 * Writes e2e/artifacts/live-poll-ordering-<engine>.json: the ids of each page.
 */
import {
	type TableDataResultSchemaType,
	tableDataResultSchema,
} from "@db-studio/shared/types";
import { z } from "zod";
import {
	assertEqual,
	checks,
	inProcessApp,
	requireDatabaseUrl,
	writeArtifact,
} from "./lib.js";

const { url, dbType } = requireDatabaseUrl(
	"pg",
	"mysql",
	"mssql",
	"sqlite",
	"duckdb",
	"oracle",
);

const { call, query, close } = await inProcessApp(url);

const TABLE = "live_poll_items";
const INSERT_ORDER = [3, 1, 5, 2, 4];
const rankOf = (id: number) => 10 - id;

// Oracle folds unquoted names to uppercase; the adapter quotes the lowercase names used here.
const q = (name: string) => (dbType === "oracle" ? `"${name}"` : name);
const [t, id, grp, rnk, name] = [TABLE, "id", "grp", "rnk", "name"].map(q);

const createTable: Partial<Record<typeof dbType, string[]>> = {
	pg: [
		`CREATE TABLE ${t} (id INT PRIMARY KEY, grp INT NOT NULL, rnk INT NOT NULL, name TEXT NOT NULL)`,
		`CREATE INDEX ${TABLE}_grp_rnk ON ${t} (grp, rnk)`,
	],
	mysql: [
		`CREATE TABLE ${t} (id INT PRIMARY KEY, grp INT NOT NULL, rnk INT NOT NULL, name VARCHAR(50) NOT NULL, KEY idx_grp_rnk (grp, rnk, name))`,
	],
	// A heap with a nonclustered key: physical order is insertion order, not key order.
	mssql: [
		`CREATE TABLE ${t} (id INT PRIMARY KEY NONCLUSTERED, grp INT NOT NULL, rnk INT NOT NULL, name NVARCHAR(50) NOT NULL)`,
		`CREATE INDEX idx_grp_rnk ON ${t} (grp, rnk) INCLUDE (name)`,
	],
	sqlite: [
		`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name TEXT NOT NULL)`,
		`CREATE INDEX ${TABLE}_grp_rnk ON ${t} (grp, rnk)`,
	],
	duckdb: [
		`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name VARCHAR NOT NULL)`,
	],
	// Heap table: without a key in ORDER BY, rows come back in insertion order.
	oracle: [
		`CREATE TABLE ${t} (${id} NUMBER(10) PRIMARY KEY, ${grp} NUMBER(10) NOT NULL, ${rnk} NUMBER(10) NOT NULL, ${name} VARCHAR2(50) NOT NULL)`,
		`CREATE INDEX idx_grp_rnk ON ${t} (${grp}, ${rnk}, ${name})`,
	],
};

const seed = async () => {
	await query(`DROP TABLE IF EXISTS ${t}`);

	for (const statement of createTable[dbType] ?? []) await query(statement);

	for (const key of INSERT_ORDER) {
		await query(
			`INSERT INTO ${t} (${id}, ${grp}, ${rnk}, ${name}) VALUES (${key}, 1, ${rankOf(key)}, 'row ${key}')`,
		);
	}
};

const pageSchema = z.object({ data: tableDataResultSchema });

const page = async (params: Record<string, string>) => {
	const search = new URLSearchParams({ limit: "3", ...params });
	const { status, body } = await call("GET", `/tables/${TABLE}/data?${search}`);

	if (status !== 200) throw new Error(`page ${search}: ${status} ${JSON.stringify(body)}`);

	return pageSchema.parse(body).data;
};

const ids = (rows: TableDataResultSchemaType["data"]) => rows.map((row) => Number(row.id));

const byGroup = { sort: "grp", order: "asc" };

const evidence: Record<string, number[]> = {};
const { report, finish } = checks();

const scenario = async (title: string, run: () => Promise<number[]>, expected: number[]) => {
	try {
		await seed();
		const observed = await run();
		evidence[title] = observed;
		assertEqual(observed, expected, "page ids");
		report(title);
	} catch (error) {
		report(title, error instanceof Error ? error.message : String(error));
	}
};

await scenario(
	"an unsorted page comes back in primary-key order",
	async () => ids((await page({})).data),
	[1, 2, 3],
);

await scenario(
	"a non-unique sort breaks ties by primary key",
	async () => ids((await page(byGroup)).data),
	[1, 2, 3],
);

await scenario(
	"rows keep their place when an unsorted column changes between polls",
	async () => {
		await page(byGroup);
		await query(`UPDATE ${t} SET ${rnk} = 99, ${name} = 'edited' WHERE ${id} IN (1, 5)`);

		return ids((await page(byGroup)).data);
	},
	[1, 2, 3],
);

await scenario(
	"paging through tied rows repeats and skips none",
	async () => {
		const first = await page({ ...byGroup, limit: "2" });

		const second = await page({
			...byGroup,
			limit: "2",
			cursor: String(first.meta.nextCursor),
		});

		const third = await page({
			...byGroup,
			limit: "2",
			cursor: String(second.meta.nextCursor),
		});

		if (third.meta.hasNextPage) throw new Error("the last page reports a next page");

		return [...ids(first.data), ...ids(second.data), ...ids(third.data)];
	},
	[1, 2, 3, 4, 5],
);

await scenario(
	"paging back returns the rows it came from",
	async () => {
		const first = await page({ ...byGroup, limit: "2" });

		const second = await page({
			...byGroup,
			limit: "2",
			cursor: String(first.meta.nextCursor),
		});

		const back = await page({
			...byGroup,
			limit: "2",
			cursor: String(second.meta.prevCursor),
			direction: "desc",
		});

		return ids(back.data);
	},
	[1, 2],
);

await scenario(
	"a descending sort breaks ties in its own direction",
	async () => ids((await page({ sort: "grp", order: "desc" })).data),
	[5, 4, 3],
);

if (dbType === "mssql") {
	await scenario(
		"the key of a same-named table in another schema is ignored",
		async () => {
			await query("IF SCHEMA_ID('live_audit') IS NULL EXEC('CREATE SCHEMA live_audit')");
			await query(`DROP TABLE IF EXISTS live_audit.${TABLE}`);
			await query(`CREATE TABLE live_audit.${TABLE} (audit_id INT PRIMARY KEY)`);

			try {
				return ids((await page({})).data);
			} finally {
				await query(`DROP TABLE live_audit.${TABLE}`);
			}
		},
		[1, 2, 3],
	);
}

await query(`DROP TABLE IF EXISTS ${t}`);

await close();

finish(await writeArtifact(`live-poll-ordering-${dbType}.json`, evidence));
