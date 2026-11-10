/**
 * Bulk insert of records that name different columns (a CSV or JSON import with sparse fields),
 * run against real SQLite and DuckDB files. SQLite has its own batch; DuckDB its own prepared
 * statement. Failure modes:
 * - the INSERT names only the first record's columns, so a later record loses a value
 * - a record missing a column binds `undefined` instead of NULL and the driver refuses it
 * - a column a record leaves out gets NULL instead of its DEFAULT
 * - a record a constraint refuses loses its position in the message, or its 409 turns into 500
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { DuckDbAdapter } from "@/adapters/duckdb/duckdb.adapter.js";
import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";
import { openEngine } from "../engine.js";

const engines = [
	{ name: "SqliteAdapter", engine: "sqlite", db: "main", adapter: new SqliteAdapter() },
	{ name: "DuckDbAdapter", engine: "duckdb", db: "scratch", adapter: new DuckDbAdapter() },
] as const satisfies { name: string; engine: string; db: string; adapter: IDbAdapter }[];

for (const engine of engines) {
	describe(`${engine.name} bulk insert of records with different columns`, () => {
		let opened: Awaited<ReturnType<typeof openEngine>>;

		beforeAll(async () => {
			opened = await openEngine(engine.engine);
			await opened.exec(
				"CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, email TEXT DEFAULT 'none')",
			);
		});

		afterAll(() => opened.close());

		it("writes the columns each record names and the DEFAULT of the others", async () => {
			await engine.adapter.bulkInsertRecords({
				db: engine.db,
				tableName: "people",
				records: [
					{ id: 1, name: "Ada" },
					{ id: 2, name: "Bob", email: "bob@example.com" },
					{ id: 3, email: "cy@example.com" },
				],
			});

			const rows = await opened.rows("SELECT id, name, email FROM people ORDER BY id");

			expect(rows.map((row) => [Number(row.id), row.name, row.email])).toEqual([
				[1, "Ada", "none"],
				[2, "Bob", "bob@example.com"],
				[3, null, "cy@example.com"],
			]);
		});

		it("names the record a constraint refuses and keeps the conflict status", async () => {
			await expect(
				engine.adapter.bulkInsertRecords({
					db: engine.db,
					tableName: "people",
					records: [
						{ id: 4, name: "Dee" },
						{ id: 1, name: "Ada again" },
					],
				}),
			).rejects.toMatchObject({
				status: 409,
				message: expect.stringMatching(/^Failed to insert record 2: /),
			});
		});
	});
}
