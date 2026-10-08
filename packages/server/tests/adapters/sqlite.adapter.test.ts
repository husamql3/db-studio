/**
 * Runs SqliteAdapter against a real libSQL file database opened through db-manager.
 * Failure modes:
 * - a `sqlite://` path containing a space is not turned into a valid file: URL, so nothing opens
 * - type affinity mapping sends BLOB/DATETIME columns to the wrong cell variant
 * - deleteTable drops a table that other tables reference instead of reporting fkViolation
 * - deleteRecords on a referenced row surfaces a 500 instead of fkViolation with the child rows
 * - getTableColumns loses the FK target or the PK flag (live mode and the FK picker need both)
 * - renameTable breaks on a table name containing a double quote
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";

vi.unmock("@/db-manager.js");

const dir = mkdtempSync(path.join(tmpdir(), "db-studio-sqlite-"));
let adapter: SqliteAdapter;
let exec: (sql: string) => Promise<void>;

beforeAll(async () => {
	process.env.DATABASE_URL = `sqlite://${path.join(dir, "my db.sqlite")}`;
	vi.resetModules();
	const { SqliteAdapter } = await import("@/adapters/sqlite/sqlite.adapter.js");
	const { getSqliteClient } = await import("@/db-manager.js");
	const client = await getSqliteClient();
	exec = async (sql) => {
		await client.executeMultiple(sql);
	};
	adapter = new SqliteAdapter();

	await exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
		CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id));
		INSERT INTO users VALUES (1, 'Ada'), (2, 'Linus');
		INSERT INTO orders VALUES (10, 1);
	`);
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
});
