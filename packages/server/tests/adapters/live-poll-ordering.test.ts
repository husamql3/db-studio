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
 * SQLite runs in memory on every test run. MySQL and SQL Server run only when
 * MYSQL_TEST_URL / MSSQL_TEST_URL are set, e.g.
 *   MYSQL_TEST_URL=mysql://root@127.0.0.1:3306/dbstudio
 *   MSSQL_TEST_URL=mssql://sa:DbStudio1!@127.0.0.1:1433/master
 */
import type { SortType } from "@db-studio/shared/types";
import Database from "better-sqlite3";
import sql from "mssql";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const connections = vi.hoisted(() => ({
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getSqliteDb: vi.fn(),
}));

vi.mock("@/adapters/connections.js", () => connections);

import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";

const TABLE = "live_poll_items";
const INSERT_ORDER = [3, 1, 5, 2, 4];
const rankOf = (id: number) => 10 - id;

interface Engine {
	name: string;
	url: string | undefined;
	adapter: IDbAdapter;
	connect: (url: string) => Promise<void>;
	exec: (statement: string) => Promise<void>;
	close: () => Promise<void>;
	schema: string[];
}

let mysqlPool: mysql.Pool | undefined;
let mssqlPool: sql.ConnectionPool | undefined;
let sqliteDb: Database.Database | undefined;

const engines: Engine[] = [
	{
		name: "sqlite",
		url: ":memory:",
		adapter: new SqliteAdapter(),
		connect: async (url) => {
			sqliteDb = new Database(url);
			connections.getSqliteDb.mockReturnValue(sqliteDb);
		},
		exec: async (statement) => {
			sqliteDb?.exec(statement);
		},
		close: async () => {
			sqliteDb?.close();
		},
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name TEXT NOT NULL)`,
			`CREATE INDEX ${TABLE}_grp_rnk ON ${TABLE} (grp, rnk)`,
		],
	},
	{
		name: "mysql",
		url: process.env.MYSQL_TEST_URL,
		adapter: new MySqlAdapter(),
		connect: async (url) => {
			mysqlPool = mysql.createPool(url);
			connections.getMysqlPool.mockReturnValue(mysqlPool);
		},
		exec: async (statement) => {
			await mysqlPool?.query(statement);
		},
		close: async () => mysqlPool?.end(),
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INT PRIMARY KEY, grp INT NOT NULL, rnk INT NOT NULL, name VARCHAR(50) NOT NULL, KEY idx_grp_rnk (grp, rnk, name))`,
		],
	},
	{
		name: "mssql",
		url: process.env.MSSQL_TEST_URL,
		adapter: new MsSqlAdapter(),
		connect: async (url) => {
			const { username, password, hostname, port, pathname } = new URL(url);
			mssqlPool = await new sql.ConnectionPool({
				server: hostname,
				port: Number(port),
				user: decodeURIComponent(username),
				password: decodeURIComponent(password),
				database: pathname.slice(1),
				options: { encrypt: false, trustServerCertificate: true },
			}).connect();
			connections.getMssqlPool.mockResolvedValue(mssqlPool);
		},
		exec: async (statement) => {
			await mssqlPool?.request().query(statement);
		},
		close: async () => mssqlPool?.close(),
		// A heap with a nonclustered key: physical order is insertion order, not key order.
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INT PRIMARY KEY NONCLUSTERED, grp INT NOT NULL, rnk INT NOT NULL, name NVARCHAR(50) NOT NULL)`,
			`CREATE INDEX idx_grp_rnk ON ${TABLE} (grp, rnk) INCLUDE (name)`,
		],
	},
];

const bySharedGroup: SortType[] = [{ columnName: "grp", direction: "asc" }];

for (const engine of engines) {
	describe.skipIf(!engine.url)(`${engine.name} live polling`, () => {
		const { adapter } = engine;
		const ids = (rows: Record<string, unknown>[]) => rows.map((row) => Number(row.id));
		const page = (params: Omit<Parameters<IDbAdapter["getTableData"]>[0], "tableName" | "db">) =>
			adapter.getTableData({ tableName: TABLE, db: "", ...params });

		beforeAll(async () => {
			await engine.connect(engine.url as string);
		});

		afterAll(async () => {
			await engine.exec(`DROP TABLE IF EXISTS ${TABLE}`);
			await engine.close();
		});

		beforeEach(async () => {
			for (const statement of engine.schema) await engine.exec(statement);
			for (const id of INSERT_ORDER) {
				await engine.exec(
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
			await engine.exec(`UPDATE ${TABLE} SET rnk = 99, name = 'edited' WHERE id IN (1, 5)`);
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

		it.runIf(engine.name === "mssql")(
			"ignores the key of a same-named table in another schema",
			async () => {
				await engine.exec(
					"IF SCHEMA_ID('live_audit') IS NULL EXEC('CREATE SCHEMA live_audit')",
				);
				await engine.exec(`DROP TABLE IF EXISTS live_audit.${TABLE}`);
				await engine.exec(`CREATE TABLE live_audit.${TABLE} (audit_id INT PRIMARY KEY)`);
				try {
					const { data } = await page({ limit: 3 });
					expect(ids(data)).toEqual([1, 2, 3]);
				} finally {
					await engine.exec(`DROP TABLE live_audit.${TABLE}`);
				}
			},
		);

		it("breaks ties in the sort's direction when sorting descending", async () => {
			const { data } = await page({
				sort: [{ columnName: "grp", direction: "desc" }],
				limit: 3,
			});
			expect(ids(data)).toEqual([5, 4, 3]);
		});
	});
}
