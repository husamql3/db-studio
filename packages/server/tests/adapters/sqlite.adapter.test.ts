import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSqliteDb = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getSqliteDb: mockGetSqliteDb,
}));

import { SqliteAdapter } from "@/adapters/sqlite/sqlite.adapter.js";

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

const tableInfoRows = [
	{ cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
	{ cid: 1, name: "name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
];

const tableDataRows = [
	{ id: 1, name: "Ada" },
	{ id: 2, name: "Linus" },
];

function handleAll(sql: string): unknown[] {
	const s = sql.trim().toUpperCase();

	if (s.includes("DATABASE_LIST")) {
		return [{ seq: 0, name: "main", file: "/tmp/test.db" }];
	}
	if (s.includes("SQLITE_MASTER") && s.includes("SQLITE_%")) {
		return [{ name: "users" }];
	}
	if (s.includes("SQLITE_MASTER") && !s.includes("NAME NOT LIKE")) {
		return [{ name: "users", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)" }];
	}
	if (s.includes("PRAGMA TABLE_INFO")) return tableInfoRows;
	if (s.includes("PRAGMA FOREIGN_KEY_LIST")) return [];
	if (s.includes("PRAGMA INDEX_LIST")) return [];
	if (s.includes("PRAGMA FOREIGN_KEY_CHECK")) return [];
	if (s.includes("COUNT(*) AS TOTAL")) return [{ total: 2 }];
	if (s.includes("COUNT(*) AS COUNT")) return [{ count: 2 }];
	if (s.startsWith("SELECT * FROM") || s.startsWith("SELECT *, ROWID FROM")) {
		return tableDataRows;
	}
	return [];
}

function handleGet(sql: string): unknown {
	const s = sql.trim().toUpperCase();

	if (s.includes("SQLITE_VERSION")) return { version: "3.49.0" };
	if (s.includes("DATABASE_LIST")) return { seq: 0, name: "main", file: "/tmp/test.db" };
	if (s.includes("SQLITE_MASTER") && s.includes("NAME=?"))
		return { name: "users", sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)" };
	if (s.includes("COUNT(*)")) return { count: 2, total: 2 };
	return null;
}

function createMockDb() {
	return {
		prepare: vi.fn((sql: string) => ({
			all: vi.fn((..._args: unknown[]) => handleAll(sql)),
			get: vi.fn((..._args: unknown[]) => handleGet(sql)),
			run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
			reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
		})),
		pragma: vi.fn(),
		// transaction(fn) returns fn; calling the result calls fn()
		transaction: vi.fn(<T>(fn: (...args: unknown[]) => T) => fn),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SqliteAdapter — type mapping and query building", () => {
	let adapter: SqliteAdapter;
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		db = createMockDb();
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("mapToUniversalType maps sqlite types correctly", () => {
		expect(adapter.mapToUniversalType("integer")).toBe("number");
		expect(adapter.mapToUniversalType("INTEGER")).toBe("number");
		expect(adapter.mapToUniversalType("real")).toBe("number");
		expect(adapter.mapToUniversalType("float")).toBe("number");
		expect(adapter.mapToUniversalType("numeric")).toBe("number");
		expect(adapter.mapToUniversalType("decimal")).toBe("number");
		expect(adapter.mapToUniversalType("text")).toBe("text");
		expect(adapter.mapToUniversalType("TEXT")).toBe("text");
		expect(adapter.mapToUniversalType("varchar(255)")).toBe("text");
		expect(adapter.mapToUniversalType("blob")).toBe("text");
		expect(adapter.mapToUniversalType("boolean")).toBe("boolean");
		expect(adapter.mapToUniversalType("json")).toBe("json");
		expect(adapter.mapToUniversalType("date")).toBe("date");
		expect(adapter.mapToUniversalType("datetime")).toBe("date");
		expect(adapter.mapToUniversalType("timestamp")).toBe("date");
		expect(adapter.mapToUniversalType("time")).toBe("date");
		expect(adapter.mapToUniversalType("bigint")).toBe("number");
		expect(adapter.mapToUniversalType("tinyint")).toBe("number");
		expect(adapter.mapToUniversalType("unknown_type")).toBe("text");
	});

	it("mapFromUniversalType maps universal types to SQLite types", () => {
		expect(adapter.mapFromUniversalType("text")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("number")).toBe("INTEGER");
		expect(adapter.mapFromUniversalType("boolean")).toBe("INTEGER");
		expect(adapter.mapFromUniversalType("json")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("date")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("array")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("enum")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("unknown")).toBe("TEXT");
	});

	it("buildTableDataQuery builds correct SQL with filters and cursor", () => {
		const cursor = (
			adapter as unknown as { encodeCursor: (d: object) => string }
		).encodeCursor({ values: { id: 1 }, sortColumns: ["id"] });

		const helper = adapter as unknown as {
			buildTableDataQuery: (params: object) => { sql: string; values: unknown[] };
		};

		const bundle = helper.buildTableDataQuery({
			db: "main",
			tableName: "users",
			limit: 5,
			cursor,
			direction: "asc",
			sort: [{ columnName: "id", direction: "asc" }],
			filters: [{ columnName: "name", operator: "like", value: "%a%" }],
		});
		expect(bundle.sql).toContain('"users"');
		expect(bundle.sql).toContain("ORDER BY");
		expect(bundle.sql).toContain("LIMIT ?");
		expect(bundle.values).toContain(6); // limit + 1
	});

	it("buildTableDataQuery flips sort for desc direction", () => {
		const helper = adapter as unknown as {
			buildTableDataQuery: (params: object) => { sql: string; values: unknown[] };
		};

		const bundle = helper.buildTableDataQuery({
			db: "main",
			tableName: "users",
			limit: 5,
			direction: "desc",
			sort: [{ columnName: "name", direction: "asc" }],
		});
		expect(bundle.sql).toContain("DESC");
	});

	it("buildTableDataQuery uses rowid fallback when no sort columns", () => {
		const helper = adapter as unknown as {
			buildTableDataQuery: (params: object) => { sql: string; values: unknown[] };
		};

		const bundle = helper.buildTableDataQuery({
			db: "main",
			tableName: "users",
			limit: 10,
		});
		expect(bundle.sql).toContain("rowid");
	});
});

describe("SqliteAdapter — FK-related scenarios", () => {
	let adapter: SqliteAdapter;
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		db = createMockDb();
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("deleteTable returns fkViolation when referenced tables exist", async () => {
		// Override prepare to return FK references from "orders" table pointing to "users"
		db.prepare.mockImplementation((sql: string) => {
			const s = sql.trim().toUpperCase();
			if (s.includes("SQLITE_MASTER") && s.includes("NAME=?")) {
				return { all: vi.fn(() => []), get: vi.fn(() => ({ name: "users" })), run: vi.fn(), reader: false };
			}
			if (s.includes("COUNT(*) AS COUNT")) {
				return { all: vi.fn(() => [{ count: 5 }]), get: vi.fn(() => ({ count: 5 })), run: vi.fn(), reader: true };
			}
			// List of all tables
			if (s.includes("SQLITE_MASTER") && s.includes("SQLITE_%")) {
				return { all: vi.fn(() => [{ name: "users" }, { name: "orders" }]), get: vi.fn(), run: vi.fn(), reader: true };
			}
			// FK list for "orders" table points to "users"
			if (s.includes("PRAGMA FOREIGN_KEY_LIST")) {
				if (sql.includes("orders")) {
					return {
						all: vi.fn(() => [
							{ id: 0, seq: 0, table: "users", from: "user_id", to: "id", on_update: "CASCADE", on_delete: "CASCADE" },
						]),
						get: vi.fn(),
						run: vi.fn(),
						reader: true,
					};
				}
				return { all: vi.fn(() => []), get: vi.fn(), run: vi.fn(), reader: true };
			}
			if (s.startsWith("SELECT * FROM")) {
				return { all: vi.fn(() => [{ user_id: 1 }]), get: vi.fn(), run: vi.fn(), reader: true };
			}
			return {
				all: vi.fn(() => []),
				get: vi.fn(() => undefined),
				run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
				reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
			};
		});

		const result = await adapter.deleteTable({ db: "main", tableName: "users", cascade: false });
		expect(result.fkViolation).toBe(true);
		expect(result.deletedCount).toBe(0);
	});

	it("deleteRecords returns fkViolation when FK constraint error thrown", async () => {
		db.prepare.mockImplementation((sql: string) => ({
			all: vi.fn((..._args: unknown[]) => handleAll(sql)),
			get: vi.fn((..._args: unknown[]) => handleGet(sql)),
			run: vi.fn(() => {
				throw new Error("FOREIGN KEY constraint failed");
			}),
			reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
		}));

		// transaction wrapper: call fn directly (not inside a real transaction)
		db.transaction.mockImplementation(<T>(fn: () => T) => fn);

		const result = await adapter.deleteRecords({
			db: "main",
			tableName: "users",
			primaryKeys: [{ columnName: "id", value: 1 }],
		});
		expect(result.fkViolation).toBe(true);
		expect(result.deletedCount).toBe(0);
	});
});

describe("SqliteAdapter — getTableColumns with FK mapping", () => {
	let adapter: SqliteAdapter;
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		db = createMockDb();
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("marks FK column with referencedTable and referencedColumn", async () => {
		db.prepare.mockImplementation((sql: string) => {
			const s = sql.trim().toUpperCase();
			if (s.includes("SQLITE_MASTER") && s.includes("NAME=?")) {
				return { all: vi.fn(), get: vi.fn(() => ({ name: "orders" })), run: vi.fn(), reader: false };
			}
			if (s.includes("PRAGMA TABLE_INFO")) {
				return {
					all: vi.fn(() => [
						{ cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
						{ cid: 1, name: "user_id", type: "INTEGER", notnull: 0, dflt_value: null, pk: 0 },
					]),
					get: vi.fn(),
					run: vi.fn(),
					reader: true,
				};
			}
			if (s.includes("PRAGMA FOREIGN_KEY_LIST")) {
				return {
					all: vi.fn(() => [
						{ id: 0, seq: 0, table: "users", from: "user_id", to: "id", on_update: "CASCADE", on_delete: "SET NULL" },
					]),
					get: vi.fn(),
					run: vi.fn(),
					reader: true,
				};
			}
			return {
				all: vi.fn(() => []),
				get: vi.fn(() => undefined),
				run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
				reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
			};
		});

		const cols = await adapter.getTableColumns({ db: "main", tableName: "orders" });
		const fkCol = cols.find((c) => c.columnName === "user_id");
		expect(fkCol?.isForeignKey).toBe(true);
		expect(fkCol?.referencedTable).toBe("users");
		expect(fkCol?.referencedColumn).toBe("id");

		const pkCol = cols.find((c) => c.columnName === "id");
		expect(pkCol?.isPrimaryKey).toBe(true);
		expect(pkCol?.isForeignKey).toBe(false);
	});

	describe("getDatabasesList system filtering", () => {
		it("hides the internal temp database", async () => {
			db.prepare.mockImplementation((sql: string) => ({
				all: vi.fn(() =>
					sql.toUpperCase().includes("DATABASE_LIST")
						? [
								{ seq: 0, name: "main", file: "/tmp/test.db" },
								{ seq: 1, name: "temp", file: "" },
							]
						: handleAll(sql),
				),
				get: vi.fn((..._args: unknown[]) => handleGet(sql)),
				run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
				reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
			}));
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["main"]);
		});

		it("keeps attached databases alongside main", async () => {
			db.prepare.mockImplementation((sql: string) => ({
				all: vi.fn(() =>
					sql.toUpperCase().includes("DATABASE_LIST")
						? [
								{ seq: 0, name: "main", file: "/tmp/test.db" },
								{ seq: 1, name: "temp", file: "" },
								{ seq: 2, name: "archive", file: "/tmp/archive.db" },
							]
						: handleAll(sql),
				),
				get: vi.fn((..._args: unknown[]) => handleGet(sql)),
				run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
				reader: /^\s*(SELECT|PRAGMA)/i.test(sql.trim()),
			}));
			const result = await adapter.getDatabasesList();
			expect(result.map((d) => d.name)).toEqual(["main", "archive"]);
		});
	});
});

describe("SqliteAdapter.renameTable", () => {
	let adapter: SqliteAdapter;
	let statements: string[];
	const existing = ["users", "orders", 'we"ird'];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		statements = [];
		const db = {
			prepare: vi.fn((sql: string) => {
				const text = String(sql);
				return {
					all: vi.fn(() => []),
					get: vi.fn((...args: unknown[]) => {
						if (text.includes("sqlite_master") && text.includes("name=?")) {
							const name = args[0] as string;
							return existing.includes(name) ? { name } : undefined;
						}
						return null;
					}),
					run: vi.fn(() => {
						statements.push(text);
						return { changes: 1, lastInsertRowid: 1 };
					}),
				};
			}),
			pragma: vi.fn(),
			transaction: vi.fn(<T>(fn: (...args: unknown[]) => T) => fn),
		};
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("renames an existing table", async () => {
		await adapter.renameTable({ db: "main", tableName: "users", newTableName: "members" });
		expect(statements).toEqual(['ALTER TABLE "users" RENAME TO "members"']);
	});

	it("escapes double quotes in identifiers", async () => {
		await adapter.renameTable({ db: "main", tableName: 'we"ird', newTableName: "ok" });
		expect(statements).toEqual(['ALTER TABLE "we""ird" RENAME TO "ok"']);
	});
});
