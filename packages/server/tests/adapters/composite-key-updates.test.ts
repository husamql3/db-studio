/**
 * Grid updates on a table with a `(tenant_id, user_id)` key, run against real SQLite and DuckDB
 * files. DuckDB goes through the UPDATE that PostgreSQL, MySQL, SQL Server and Oracle share
 * (`SqlAdapter.updateRecords`); SQLite has its own batch. Failure modes:
 * - matching on `tenant_id` alone updates every user of tenant 7
 * - a row missing one key column updates by a partial key instead of answering 400
 * - two edited rows that share a key column collapse into one UPDATE
 * - a table with a single-column key no longer updates
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";

const dir = mkdtempSync(path.join(tmpdir(), "db-studio-composite-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const compositeParams = {
	tableName: "members",
	primaryKey: "tenant_id",
	primaryKeys: ["tenant_id", "user_id"],
	updates: [
		{
			columnName: "name",
			value: "Grace",
			rowData: { tenant_id: 7, user_id: 42, name: "Ada" },
		},
	],
};

type Engine = {
	name: string;
	db: string;
	open: () => Promise<{
		adapter: IDbAdapter;
		exec: (sql: string) => Promise<void>;
		select: (sql: string) => Promise<unknown[][]>;
		close: () => Promise<void>;
	}>;
};

const engines: Engine[] = [
	{
		name: "SqliteAdapter",
		db: "main",
		open: async () => {
			vi.resetModules();
			const { SqliteAdapter } = await import("@/adapters/sqlite/sqlite.adapter.js");
			const { connector, createConnection, registerConnection } =
				await import("@/open-connections.js");

			registerConnection("test", createConnection(`sqlite://${path.join(dir, "members.db")}`));
			const client = await connector("sqlite").client();

			return {
				adapter: new SqliteAdapter(),
				exec: async (sql) => {
					await client.batch([sql], "write");
				},
				select: async (sql) =>
					(await client.execute(sql)).rows.map((row) => Object.values(row).map(String)),
				close: async () => client.close(),
			};
		},
	},
	{
		name: "DuckDbAdapter",
		db: "members",
		open: async () => {
			vi.resetModules();
			const { DuckDbAdapter } = await import("@/adapters/duckdb/duckdb.adapter.js");
			const { closeAllConnections, connector, createConnection, registerConnection } =
				await import("@/open-connections.js");

			registerConnection(
				"test",
				createConnection(`duckdb://${path.join(dir, "members.duckdb")}`),
			);
			return {
				adapter: new DuckDbAdapter(),
				exec: async (sql) => {
					await connector("duckdb").withConnection((conn) => conn.run(sql));
				},
				select: async (sql) =>
					connector("duckdb").withConnection(async (conn) =>
						(await (await conn.run(sql)).getRowsJson()).map((row) => row.map(String)),
					),
				close: closeAllConnections,
			};
		},
	},
];

for (const engine of engines) {
	describe(`${engine.name} composite primary key updates`, () => {
		let opened: Awaited<ReturnType<Engine["open"]>>;
		const update = (params: unknown) =>
			opened.adapter.updateRecords({ db: engine.db, params } as never);

		beforeAll(async () => {
			opened = await engine.open();
		});

		afterAll(() => opened.close());

		beforeEach(async () => {
			await opened.exec("DROP TABLE IF EXISTS members");
			await opened.exec(
				"CREATE TABLE members (tenant_id INTEGER, user_id INTEGER, name TEXT, PRIMARY KEY (tenant_id, user_id))",
			);
			await opened.exec("INSERT INTO members VALUES (7, 42, 'Ada'), (7, 43, 'Bob')");
		});

		const names = () => opened.select("SELECT user_id, name FROM members ORDER BY user_id");

		it("updates only the row matching every key column", async () => {
			await expect(update(compositeParams)).resolves.toEqual({ updatedCount: 1 });
			expect(await names()).toEqual([
				["42", "Grace"],
				["43", "Bob"],
			]);
		});

		it("updates each of two rows that share a key column", async () => {
			await expect(
				update({
					...compositeParams,
					updates: [
						compositeParams.updates[0],
						{
							columnName: "name",
							value: "Linus",
							rowData: { tenant_id: 7, user_id: 43, name: "Bob" },
						},
					],
				}),
			).resolves.toEqual({ updatedCount: 2 });
			expect(await names()).toEqual([
				["42", "Grace"],
				["43", "Linus"],
			]);
		});

		it("rejects a row that is missing one component of the key", async () => {
			await expect(
				update({
					...compositeParams,
					updates: [{ columnName: "name", value: "Grace", rowData: { tenant_id: 7 } }],
				}),
			).rejects.toMatchObject({ status: 400 });
			expect(await names()).toEqual([
				["42", "Ada"],
				["43", "Bob"],
			]);
		});

		it("updates a table with a single-column key", async () => {
			await opened.exec("DROP TABLE IF EXISTS users");
			await opened.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
			await opened.exec("INSERT INTO users VALUES (1, 'Ada'), (2, 'Bob')");

			await expect(
				update({
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Grace", rowData: { id: 1 } }],
				}),
			).resolves.toEqual({ updatedCount: 1 });
			expect(await opened.select("SELECT id, name FROM users ORDER BY id")).toEqual([
				["1", "Grace"],
				["2", "Bob"],
			]);
		});
	});
}
