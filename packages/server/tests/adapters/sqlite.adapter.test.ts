import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPException } from "hono/http-exception";

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

describe("SqliteAdapter — happy path", () => {
	let adapter: SqliteAdapter;
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		db = createMockDb();
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("getDatabasesList returns db list", async () => {
		const result = await adapter.getDatabasesList();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("main");
		expect(result[0].encoding).toBe("UTF-8");
	});

	it("getCurrentDatabase returns main", async () => {
		const result = await adapter.getCurrentDatabase();
		expect(result).toEqual({ db: "main" });
	});

	it("getDatabaseConnectionInfo returns sqlite version", async () => {
		const info = await adapter.getDatabaseConnectionInfo();
		expect(info.version).toContain("SQLite");
		expect(info.version).toContain("3.49.0");
		expect(info.database).toBe("main");
		expect(info.host).toBeNull();
		expect(info.active_connections).toBe(1);
	});

	it("getTablesList returns tables with row counts", async () => {
		const tables = await adapter.getTablesList("main");
		expect(tables).toHaveLength(1);
		expect(tables[0].tableName).toBe("users");
		expect(tables[0].rowCount).toBe(2);
	});

	it("createTable runs CREATE TABLE", async () => {
		await adapter.createTable({
			db: "main",
			tableData: {
				tableName: "orders",
				fields: [
					{ columnName: "id", columnType: "INTEGER", isPrimaryKey: true, isIdentity: true },
					{ columnName: "total", columnType: "REAL", isNullable: false },
					{ columnName: "note", columnType: "TEXT", isNullable: true },
					{ columnName: "tags", columnType: "TEXT", isUnique: true, isNullable: true },
					{ columnName: "ref", columnType: "TEXT", isNullable: true, defaultValue: "'none'" },
				],
				foreignKeys: [
					{
						columnName: "user_id",
						referencedTable: "users",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "SET NULL",
					},
				],
			} as never,
		});
		const sql = db.prepare.mock.calls.find((c) =>
			c[0].includes("CREATE TABLE"),
		)?.[0] as string;
		expect(sql).toContain("orders");
		expect(sql).toContain("AUTOINCREMENT");
		expect(sql).toContain("FOREIGN KEY");
	});

	it("deleteTable drops table when no FK references", async () => {
		const result = await adapter.deleteTable({ db: "main", tableName: "users", cascade: false });
		expect(result.deletedCount).toBe(2);
		expect(result.fkViolation).toBe(false);
	});

	it("deleteTable cascade drops table", async () => {
		const result = await adapter.deleteTable({ db: "main", tableName: "users", cascade: true });
		expect(result.deletedCount).toBe(2);
	});

	it("getTableSchema returns CREATE TABLE SQL", async () => {
		const schema = await adapter.getTableSchema({ db: "main", tableName: "users" });
		expect(schema).toContain("CREATE TABLE");
		expect(schema).toContain("users");
	});

	it("getTableColumns returns column info with type mapping", async () => {
		const cols = await adapter.getTableColumns({ db: "main", tableName: "users" });
		expect(cols).toHaveLength(2);

		const [idCol, nameCol] = cols;
		expect(idCol.columnName).toBe("id");
		expect(idCol.isPrimaryKey).toBe(true);
		expect(idCol.isNullable).toBe(false);
		expect(idCol.dataType).toBe("number");
		expect(idCol.dataTypeLabel).toBe("int");

		expect(nameCol.columnName).toBe("name");
		expect(nameCol.isPrimaryKey).toBe(false);
		expect(nameCol.isNullable).toBe(true);
		expect(nameCol.dataType).toBe("text");
		expect(nameCol.dataTypeLabel).toBe("text");
	});

	it("addColumn runs ALTER TABLE ADD COLUMN", async () => {
		await adapter.addColumn({
			db: "main",
			tableName: "users",
			columnName: "email",
			columnType: "TEXT",
			isNullable: true,
			isUnique: false,
		} as never);

		const sql = db.prepare.mock.calls.find((c) =>
			c[0].toUpperCase().includes("ADD COLUMN"),
		)?.[0] as string;
		expect(sql).toContain("email");
		expect(sql).toContain("TEXT");
	});

	it("deleteColumn runs ALTER TABLE DROP COLUMN", async () => {
		const result = await adapter.deleteColumn({
			db: "main",
			tableName: "users",
			columnName: "name",
		});
		expect(result.deletedCount).toBe(1);
		const sql = db.prepare.mock.calls.find((c) =>
			c[0].toUpperCase().includes("DROP COLUMN"),
		)?.[0] as string;
		expect(sql).toContain("name");
	});

	it("alterColumn recreates table with modified column", async () => {
		await adapter.alterColumn({
			db: "main",
			tableName: "users",
			columnName: "name",
			columnType: "VARCHAR(255)",
			isNullable: false,
		} as never);

		const createSql = db.prepare.mock.calls.find((c) =>
			c[0].toUpperCase().includes("CREATE TABLE"),
		)?.[0] as string;
		expect(createSql).toContain("VARCHAR(255)");
	});

	it("renameColumn runs ALTER TABLE RENAME COLUMN", async () => {
		await adapter.renameColumn({
			db: "main",
			tableName: "users",
			columnName: "name",
			newColumnName: "full_name",
		});
		const sql = db.prepare.mock.calls.find((c) =>
			c[0].toUpperCase().includes("RENAME COLUMN"),
		)?.[0] as string;
		expect(sql).toContain("full_name");
	});

	it("getTableData returns paginated results", async () => {
		const result = await adapter.getTableData({
			db: "main",
			tableName: "users",
			limit: 2,
			sort: "id",
		});
		expect(result.meta.total).toBe(2);
		expect(result.data).toHaveLength(2);
		expect(result.meta.limit).toBe(2);
	});

	it("getTableData with cursor and desc direction", async () => {
		const cursor = (
			adapter as unknown as { encodeCursor: (d: object) => string }
		).encodeCursor({ values: { id: 1 }, sortColumns: ["id"] });

		const result = await adapter.getTableData({
			db: "main",
			tableName: "users",
			limit: 2,
			direction: "desc",
			cursor,
			sort: [{ columnName: "id", direction: "desc" }],
		});
		expect(result.meta).toBeDefined();
	});

	it("getTableData with filters", async () => {
		const result = await adapter.getTableData({
			db: "main",
			tableName: "users",
			limit: 10,
			filters: [{ columnName: "name", operator: "like", value: "%a%" }],
		});
		expect(result.data).toBeDefined();
	});

	it("exportTableData returns cols and rows", async () => {
		const result = await adapter.exportTableData({ db: "main", tableName: "users" });
		expect(result.cols).toEqual(["id", "name"]);
		expect(result.rows).toHaveLength(2);
	});

	it("addRecord inserts a record", async () => {
		const result = await adapter.addRecord({
			db: "main",
			params: { tableName: "users", data: { name: "Grace" } },
		} as never);
		expect(result.insertedCount).toBe(1);
	});

	it("updateRecords updates rows in a transaction", async () => {
		const result = await adapter.updateRecords({
			db: "main",
			params: {
				tableName: "users",
				primaryKey: "id",
				updates: [{ columnName: "name", value: "Grace", rowData: { id: 1 } }],
			},
		} as never);
		expect(result.updatedCount).toBe(1);
	});

	it("deleteRecords deletes rows", async () => {
		const result = await adapter.deleteRecords({
			db: "main",
			tableName: "users",
			primaryKeys: [{ columnName: "id", value: 1 }],
		});
		expect(result.deletedCount).toBe(1);
		expect(result.fkViolation).toBe(false);
		expect(result.relatedRecords).toEqual([]);
	});

	it("forceDeleteRecords deletes with FK disabled", async () => {
		const result = await adapter.forceDeleteRecords({
			db: "main",
			tableName: "users",
			primaryKeys: [{ columnName: "id", value: 1 }],
		});
		expect(result.deletedCount).toBe(1);
		expect(db.pragma).toHaveBeenCalledWith("foreign_keys = OFF");
		expect(db.pragma).toHaveBeenCalledWith("foreign_keys = ON");
	});

	it("bulkInsertRecords inserts multiple records in a transaction", async () => {
		const result = await adapter.bulkInsertRecords({
			db: "main",
			tableName: "users",
			records: [{ name: "Ada" }, { name: "Grace" }],
		});
		expect(result.success).toBe(true);
		expect(result.successCount).toBe(2);
		expect(result.failureCount).toBe(0);
	});

	it("executeQuery handles SELECT", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(() => [{ id: 1 }]),
			get: vi.fn(),
			run: vi.fn(),
			reader: true,
		});
		const result = await adapter.executeQuery({ db: "main", query: "SELECT 1 as id;" });
		expect(result.columns).toEqual(["id"]);
		expect(result.rowCount).toBe(1);
		expect(result.duration).toBeTypeOf("number");
	});

	it("executeQuery handles INSERT/UPDATE/DELETE", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(),
			run: vi.fn(() => ({ changes: 3, lastInsertRowid: 3 })),
			reader: false,
		});
		const result = await adapter.executeQuery({
			db: "main",
			query: "DELETE FROM users WHERE id > 0",
		});
		expect(result.rowCount).toBe(3);
		expect(result.message).toContain("3 rows affected");
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

	it("quoteIdentifier wraps in double quotes", () => {
		const helper = adapter as unknown as { quoteIdentifier: (n: string) => string };
		expect(helper.quoteIdentifier("my_table")).toBe('"my_table"');
	});

	it("decodeCursor returns null for invalid input", () => {
		const helper = adapter as unknown as { decodeCursor: (s: string) => unknown };
		expect(helper.decodeCursor("not-a-cursor")).toBeNull();
	});

	it("buildCursors returns null cursors for empty rows", () => {
		const helper = adapter as unknown as {
			buildCursors: (
				params: object,
				rows: unknown[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
		};
		expect(helper.buildCursors({ sort: "id", direction: "asc" }, [], false)).toEqual({
			nextCursor: null,
			prevCursor: null,
		});
	});

	it("buildCursors creates next cursor when hasMore = true (asc)", () => {
		const helper = adapter as unknown as {
			buildCursors: (
				params: object,
				rows: unknown[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
		};
		const result = helper.buildCursors(
			{ sort: "id", direction: "asc" },
			[{ id: 1 }, { id: 2 }],
			true,
		);
		expect(result.nextCursor).toBeTypeOf("string");
		expect(result.prevCursor).toBeNull();
	});

	it("buildCursors creates prev cursor when cursor provided (asc)", () => {
		const cursor = (
			adapter as unknown as { encodeCursor: (d: object) => string }
		).encodeCursor({ values: { id: 0 }, sortColumns: ["id"] });

		const helper = adapter as unknown as {
			buildCursors: (
				params: object,
				rows: unknown[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
		};
		const result = helper.buildCursors(
			{ sort: "id", direction: "asc", cursor },
			[{ id: 1 }, { id: 2 }],
			false,
		);
		expect(result.prevCursor).toBeTypeOf("string");
		expect(result.nextCursor).toBeNull();
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

describe("SqliteAdapter — validation / error branches", () => {
	let adapter: SqliteAdapter;
	let db: ReturnType<typeof createMockDb>;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new SqliteAdapter();
		db = createMockDb();
		mockGetSqliteDb.mockReturnValue(db);
	});

	it("getDatabasesList throws 500 when no databases returned", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(() => []),
			get: vi.fn(),
			run: vi.fn(),
			reader: true,
		});
		await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 500 });
	});

	it("deleteTable throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(() => []),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.deleteTable({ db: "main", tableName: "no_such", cascade: false }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("getTableSchema throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.getTableSchema({ db: "main", tableName: "no_such" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("getTableColumns throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.getTableColumns({ db: "main", tableName: "no_such" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("addColumn throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.addColumn({
				db: "main",
				tableName: "no_such",
				columnName: "email",
				columnType: "TEXT",
			} as never),
		).rejects.toMatchObject({ status: 404 });
	});

	it("addColumn throws 409 when column already exists", async () => {
		// First prepare: table exists
		db.prepare
			.mockReturnValueOnce({
				all: vi.fn(),
				get: vi.fn(() => ({ name: "users" })),
				run: vi.fn(),
				reader: false,
			})
			// Second prepare: column info already has "name"
			.mockReturnValueOnce({
				all: vi.fn(() => [{ name: "id" }, { name: "name" }]),
				get: vi.fn(),
				run: vi.fn(),
				reader: true,
			});

		await expect(
			adapter.addColumn({
				db: "main",
				tableName: "users",
				columnName: "name",
				columnType: "TEXT",
			} as never),
		).rejects.toMatchObject({ status: 409 });
	});

	it("deleteColumn throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.deleteColumn({ db: "main", tableName: "no_such", columnName: "x" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("deleteColumn throws 404 for missing column", async () => {
		db.prepare
			.mockReturnValueOnce({
				all: vi.fn(),
				get: vi.fn(() => ({ name: "users" })),
				run: vi.fn(),
				reader: false,
			})
			.mockReturnValueOnce({
				all: vi.fn(() => [{ name: "id" }]),
				get: vi.fn(),
				run: vi.fn(),
				reader: true,
			});
		await expect(
			adapter.deleteColumn({ db: "main", tableName: "users", columnName: "nonexistent" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("alterColumn throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.alterColumn({
				db: "main",
				tableName: "no_such",
				columnName: "name",
				columnType: "TEXT",
			} as never),
		).rejects.toMatchObject({ status: 404 });
	});

	it("alterColumn throws 404 for missing column", async () => {
		db.prepare
			.mockReturnValueOnce({
				all: vi.fn(),
				get: vi.fn(() => ({ name: "users" })),
				run: vi.fn(),
				reader: false,
			})
			.mockReturnValueOnce({
				all: vi.fn(() => [{ cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 }]),
				get: vi.fn(),
				run: vi.fn(),
				reader: true,
			});
		await expect(
			adapter.alterColumn({
				db: "main",
				tableName: "users",
				columnName: "nonexistent",
				columnType: "TEXT",
			} as never),
		).rejects.toMatchObject({ status: 404 });
	});

	it("renameColumn throws 404 for missing table", async () => {
		db.prepare.mockReturnValueOnce({
			all: vi.fn(),
			get: vi.fn(() => null),
			run: vi.fn(),
			reader: false,
		});
		await expect(
			adapter.renameColumn({
				db: "main",
				tableName: "no_such",
				columnName: "x",
				newColumnName: "y",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("renameColumn throws 404 for missing column", async () => {
		db.prepare
			.mockReturnValueOnce({
				all: vi.fn(),
				get: vi.fn(() => ({ name: "users" })),
				run: vi.fn(),
				reader: false,
			})
			.mockReturnValueOnce({
				all: vi.fn(() => [{ name: "id" }]),
				get: vi.fn(),
				run: vi.fn(),
				reader: true,
			});
		await expect(
			adapter.renameColumn({
				db: "main",
				tableName: "users",
				columnName: "nonexistent",
				newColumnName: "new",
			}),
		).rejects.toMatchObject({ status: 404 });
	});

	it("renameColumn throws 409 when new column name already exists", async () => {
		db.prepare
			.mockReturnValueOnce({
				all: vi.fn(),
				get: vi.fn(() => ({ name: "users" })),
				run: vi.fn(),
				reader: false,
			})
			.mockReturnValueOnce({
				all: vi.fn(() => [{ name: "id" }, { name: "full_name" }]),
				get: vi.fn(),
				run: vi.fn(),
				reader: true,
			});
		await expect(
			adapter.renameColumn({
				db: "main",
				tableName: "users",
				columnName: "id",
				newColumnName: "full_name",
			}),
		).rejects.toMatchObject({ status: 409 });
	});

	it("updateRecords throws 400 when primary key missing from rowData", async () => {
		await expect(
			adapter.updateRecords({
				db: "main",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Ada", rowData: {} }],
				},
			} as never),
		).rejects.toMatchObject({ status: 400 });
	});

	it("deleteRecords throws 400 when primaryKeys is empty", async () => {
		await expect(
			adapter.deleteRecords({ db: "main", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("forceDeleteRecords throws 400 when primaryKeys is empty", async () => {
		await expect(
			adapter.forceDeleteRecords({ db: "main", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("addRecord throws 400 when no data provided", async () => {
		await expect(
			adapter.addRecord({ db: "main", params: { tableName: "users", data: {} } } as never),
		).rejects.toMatchObject({ status: 400 });
	});

	it("bulkInsertRecords throws 400 for empty records array", async () => {
		await expect(
			adapter.bulkInsertRecords({ db: "main", tableName: "users", records: [] }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("executeQuery throws 400 for empty query", async () => {
		await expect(adapter.executeQuery({ db: "main", query: "" })).rejects.toMatchObject({
			status: 400,
		});
	});

	it("executeQuery throws 400 for whitespace-only query", async () => {
		await expect(adapter.executeQuery({ db: "main", query: "   " })).rejects.toMatchObject({
			status: 400,
		});
	});

	it("wrapError maps ECONNREFUSED to 503", () => {
		const err = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
		const helper = adapter as unknown as { wrapError: (e: unknown) => { status: number } };
		expect(helper.wrapError(err).status).toBe(503);
	});

	it("wrapError maps generic Error to 500", () => {
		const helper = adapter as unknown as { wrapError: (e: unknown) => { status: number } };
		expect(helper.wrapError(new Error("boom")).status).toBe(500);
	});

	it("wrapError passes through HTTPException unchanged", () => {
		const http409 = new HTTPException(409, { message: "conflict" });
		const helper = adapter as unknown as { wrapError: (e: unknown) => { status: number } };
		expect(helper.wrapError(http409).status).toBe(409);
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
});
