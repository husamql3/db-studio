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
 * SQLite runs on a temporary file and DuckDB in memory on every test run. MySQL, SQL Server and Oracle run
 * only when MYSQL_TEST_URL / MSSQL_TEST_URL / ORACLE_TEST_URL are set, e.g.
 *   MYSQL_TEST_URL=mysql://root@127.0.0.1:3306/dbstudio
 *   MSSQL_TEST_URL=mssql://sa:DbStudio1!@127.0.0.1:1433/master
 *   ORACLE_TEST_URL=oracle://dbstudio:dbstudio@127.0.0.1:1521/FREEPDB1
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SortType } from "@db-studio/shared/types";
import { type Client as LibsqlClient, createClient as createLibsqlClient } from "@libsql/client";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import sql from "mssql";
import mysql from "mysql2/promise";
import oracledb from "oracledb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const connections = vi.hoisted(() => ({
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getSqliteClient: vi.fn(),
	withDuckdbConnection: vi.fn(),
	getOraclePool: vi.fn(),
}));

vi.mock("@/adapters/connections.js", () => connections);

import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";
import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";
import { OracleAdapter } from "@/adapters/oracle/oracle.adapter.js";
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
let sqliteClient: LibsqlClient | undefined;
const sqliteDir = mkdtempSync(path.join(tmpdir(), "db-studio-live-poll-"));
let duckdbInstance: DuckDBInstance | undefined;
let duckdb: DuckDBConnection | undefined;
let oraclePool: oracledb.Pool | undefined;

const engines: Engine[] = [
	{
		name: "sqlite",
		url: pathToFileURL(path.join(sqliteDir, "live-poll.db")).href,
		adapter: new SqliteAdapter(),
		connect: async (url) => {
			sqliteClient = createLibsqlClient({ url, intMode: "bigint" });
			connections.getSqliteClient.mockResolvedValue(sqliteClient);
		},
		exec: async (statement) => {
			await sqliteClient?.execute(statement);
		},
		close: async () => {
			sqliteClient?.close();
			rmSync(sqliteDir, { recursive: true, force: true });
		},
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name TEXT NOT NULL)`,
			`CREATE INDEX ${TABLE}_grp_rnk ON ${TABLE} (grp, rnk)`,
		],
	},
	{
		name: "duckdb",
		url: ":memory:",
		adapter: new DuckDbAdapter(),
		connect: async (url) => {
			duckdbInstance = await DuckDBInstance.create(url);
			const connection = await duckdbInstance.connect();
			duckdb = connection;
			connections.withDuckdbConnection.mockImplementation(
				(fn: (c: DuckDBConnection) => Promise<unknown>) => fn(connection),
			);
		},
		exec: async (statement) => {
			await duckdb?.run(statement);
		},
		close: async () => {
			duckdb?.closeSync();
			duckdbInstance?.closeSync();
		},
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, grp INTEGER NOT NULL, rnk INTEGER NOT NULL, name VARCHAR NOT NULL)`,
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
	{
		name: "oracle",
		url: process.env.ORACLE_TEST_URL,
		adapter: new OracleAdapter(),
		connect: async (url) => {
			const { username, password, hostname, port, pathname } = new URL(url);
			oraclePool = await oracledb.createPool({
				user: decodeURIComponent(username),
				password: decodeURIComponent(password),
				connectString: `${hostname}:${port || 1521}${pathname}`,
			});
			connections.getOraclePool.mockResolvedValue(oraclePool);
		},
		// Oracle folds unquoted names to uppercase; the adapter quotes the lowercase names used here.
		exec: async (statement) => {
			const connection = await oraclePool?.getConnection();
			try {
				await connection?.execute(
					statement.replace(/(?<!")\b(live_poll_items|id|grp|rnk|name)\b(?!")/g, '"$1"'),
					[],
					{ autoCommit: true },
				);
			} finally {
				await connection?.close();
			}
		},
		close: async () => oraclePool?.close(0),
		// Heap table: without a key in ORDER BY, rows come back in insertion order.
		schema: [
			`DROP TABLE IF EXISTS ${TABLE}`,
			`CREATE TABLE ${TABLE} (id NUMBER(10) PRIMARY KEY, grp NUMBER(10) NOT NULL, rnk NUMBER(10) NOT NULL, name VARCHAR2(50) NOT NULL)`,
			`CREATE INDEX idx_grp_rnk ON ${TABLE} (grp, rnk, name)`,
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
