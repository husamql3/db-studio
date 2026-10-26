/**
 * Runs SqliteAdapter against a real libSQL file database opened through db-manager.
 * Failure modes:
 * - a `sqlite://` path containing a space is not turned into a valid file: URL, so nothing opens
 * - type affinity mapping sends BLOB/DATETIME columns to the wrong cell variant
 * - deleteTable drops a table that other tables reference instead of reporting fkViolation
 * - deleteRecords on a referenced row surfaces a 500 instead of fkViolation with the child rows
 * - getTableColumns loses the FK target or the PK flag (live mode and the FK picker need both)
 * - renameTable breaks on a table name containing a double quote
 * - alterColumn's table rebuild drops UNIQUE, CHECK, COLLATE, AUTOINCREMENT or a generated
 *   column, on the edited column or any other
 * - alterColumn keeps the edited column's old NOT NULL or DEFAULT
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";

vi.unmock("@/db-manager.js");

const dir = mkdtempSync(path.join(tmpdir(), "db-studio-sqlite-"));
let adapter: SqliteAdapter;
let exec: (...statements: string[]) => Promise<void>;
let select: (sql: string) => Promise<Record<string, unknown>[]>;

beforeAll(async () => {
	vi.resetModules();
	const { SqliteAdapter } = await import("@/adapters/sqlite/sqlite.adapter.js");
	const { DatabaseManager, getSqliteClient, openConnection } = await import(
		"@/db-manager.js"
	);
	openConnection(
		"test",
		new DatabaseManager(`sqlite://${path.join(dir, "my db.sqlite")}`),
	);
	const client = await getSqliteClient();
	exec = async (...statements) => {
		await client.batch(statements, "write");
	};
	select = async (sql) => (await client.execute(sql)).rows.map((row) => ({ ...row }));
	adapter = new SqliteAdapter();

	await exec(
		"CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
		"CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))",
		"INSERT INTO users VALUES (1, 'Ada'), (2, 'Linus')",
		"INSERT INTO orders VALUES (10, 1)",
	);
});

afterAll(async () => {
	const { getSqliteClient } = await import("@/db-manager.js");
	(await getSqliteClient()).close();
	rmSync(dir, { recursive: true, force: true });
});

describe("SqliteAdapter", () => {
	it("maps sqlite type affinities to cell variants", () => {
		expect(adapter.mapToUniversalType("INTEGER")).toBe("number");
		expect(adapter.mapToUniversalType("varchar(255)")).toBe("text");
		expect(adapter.mapToUniversalType("blob")).toBe("text");
		expect(adapter.mapToUniversalType("boolean")).toBe("boolean");
		expect(adapter.mapToUniversalType("json")).toBe("json");
		expect(adapter.mapToUniversalType("datetime")).toBe("date");
		expect(adapter.mapToUniversalType("unknown_type")).toBe("text");
	});

	it("reports a referenced table instead of dropping it", async () => {
		const result = await adapter.deleteTable({ db: "main", tableName: "users", cascade: false });

		expect(result).toMatchObject({ deletedCount: 0, fkViolation: true });
		expect(result.relatedRecords).toEqual([
			expect.objectContaining({ tableName: "orders", records: [{ id: 10, user_id: 1 }] }),
		]);
		expect((await adapter.getTablesList("main")).map((t) => t.tableName)).toContain("users");
	});

	it("reports a referenced row instead of failing the delete", async () => {
		const result = await adapter.deleteRecords({
			db: "main",
			tableName: "users",
			primaryKeys: [{ columnName: "id", value: 1 }],
		});

		expect(result).toMatchObject({ deletedCount: 0, fkViolation: true });
		expect(result.relatedRecords[0]?.records).toEqual([{ id: 10, user_id: 1 }]);
	});

	it("marks primary and foreign key columns", async () => {
		const cols = await adapter.getTableColumns({ db: "main", tableName: "orders" });

		expect(cols.find((c) => c.columnName === "id")).toMatchObject({
			isPrimaryKey: true,
			isForeignKey: false,
		});
		expect(cols.find((c) => c.columnName === "user_id")).toMatchObject({
			isPrimaryKey: false,
			isForeignKey: true,
			referencedTable: "users",
			referencedColumn: "id",
		});
	});

	it("renames a table whose name contains a double quote", async () => {
		await exec(`CREATE TABLE "we""ird" (id INTEGER PRIMARY KEY)`);

		await adapter.renameTable({ db: "main", tableName: 'we"ird', newTableName: 'still"odd' });

		const names = (await adapter.getTablesList("main")).map((t) => t.tableName);
		expect(names).toContain('still"odd');
		expect(names).not.toContain('we"ird');
	});

	it("keeps the table's other rules when a column is edited", async () => {
		await exec(
			"CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, quantity INT CHECK(quantity >= 0), label TEXT NOT NULL, doubled INT GENERATED ALWAYS AS (quantity * 2) STORED)",
			"INSERT INTO records (email, quantity, label) VALUES ('a@x.io', 2, 'one'), ('b@x.io', 3, 'two'), ('z@x.io', 9, 'gone')",
			"DELETE FROM records WHERE id = 3",
		);

		await adapter.alterColumn({
			db: "main",
			tableName: "records",
			columnName: "label",
			columnType: "TEXT",
			isNullable: true,
		});

		await expect(
			exec("INSERT INTO records (email, quantity, label) VALUES ('a@x.io', 1, 'dup')"),
		).rejects.toThrow(/UNIQUE/);
		await expect(
			exec("INSERT INTO records (email, quantity, label) VALUES ('c@x.io', -1, 'neg')"),
		).rejects.toThrow(/CHECK/);
		// AUTOINCREMENT never reuses an id, including 3, deleted before the edit.
		await exec("DELETE FROM records WHERE id = 2", "INSERT INTO records (email, quantity) VALUES ('d@x.io', 5)");
		expect(await select("SELECT id, quantity, doubled, label FROM records ORDER BY id")).toEqual([
			{ id: 1n, quantity: 2n, doubled: 4n, label: "one" },
			{ id: 4n, quantity: 5n, doubled: 10n, label: null },
		]);
	});

	it("changes only the nullability and default of a column with its own rules", async () => {
		await exec(
			"CREATE TABLE stock (id INTEGER PRIMARY KEY, sku TEXT COLLATE NOCASE UNIQUE NOT NULL DEFAULT 'x', qty INT)",
			"INSERT INTO stock VALUES (1, 'ABC', 1)",
		);

		await adapter.alterColumn({
			db: "main",
			tableName: "stock",
			columnName: "sku",
			columnType: "TEXT",
			isNullable: true,
			defaultValue: "'none'",
		});

		await expect(exec("INSERT INTO stock (id, sku) VALUES (2, 'abc')")).rejects.toThrow(/UNIQUE/);
		await exec("INSERT INTO stock (id, sku) VALUES (3, NULL)", "INSERT INTO stock (id, qty) VALUES (4, 1)");
		expect(await select("SELECT id, sku FROM stock ORDER BY id")).toEqual([
			{ id: 1n, sku: "ABC" },
			{ id: 3n, sku: null },
			{ id: 4n, sku: "none" },
		]);
	});
});
