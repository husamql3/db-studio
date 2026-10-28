import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMysqlPool = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getMysqlPool: mockGetMysqlPool,
}));

import { MySqlAdapter } from "@/adapters/mysql/mysql.adapter.js";

const rows = (data: unknown[] = [], fields = [{ name: "id" }]) => [data, fields] as const;
const ok = (affectedRows = 1) => [{ affectedRows }, undefined] as const;

const tableDataRows = [
	{ id: 1, name: "Ada" },
	{ id: 2, name: "Linus" },
];

function createMysqlPool() {
	const connection = {
		beginTransaction: vi.fn(async () => undefined),
		commit: vi.fn(async () => undefined),
		rollback: vi.fn(async () => undefined),
		release: vi.fn(),
		execute: vi.fn(async (sqlInput: string) => {
			const sql = String(sqlInput);
			if (sql.startsWith("SELECT")) return rows([]);
			return ok(1);
		}),
	};

	const pool = {
		getConnection: vi.fn(async () => connection),
		execute: vi.fn(async (sqlInput: string, values?: unknown[]) => {
			const sql = String(sqlInput);

			if (sql.includes("information_schema.SCHEMATA")) {
				return rows([{ name: "appdb", size: "1 MB", owner: "root", encoding: "utf8mb4" }]);
			}
			if (sql.includes("SELECT DATABASE() AS db")) return rows([{ db: "appdb" }]);
			if (sql.includes("VERSION()")) {
				return rows([
					{
						version: "MySQL 8",
						database_name: "appdb",
						user: "root@localhost",
						host: "localhost",
						port: 3306,
						max_connections: 151,
					},
				]);
			}
			if (sql.includes("PROCESSLIST")) return rows([{ cnt: 2 }]);
			if (sql.includes("FROM information_schema.tables") && sql.includes("table_name as tableName")) {
				return rows([{ tableName: "users" }]);
			}
			if (sql === "SELECT COUNT(*) as count FROM `users`") return rows([{ count: 2 }]);
			if (sql.includes("COLUMN_KEY = 'PRI'")) return rows([{ column_name: "id" }]);
			if (sql.includes("SELECT COUNT(*) as total")) return rows([{ total: 2 }]);
			if (sql.includes("SELECT * FROM `users`")) return rows(tableDataRows);
			if (sql.includes("information_schema.TABLES") && sql.includes("COUNT(*) as cnt")) {
				return rows([{ cnt: 1 }]);
			}
			if (sql.includes("SHOW CREATE TABLE")) {
				return rows([{ "Create Table": "CREATE TABLE `users` (`id` int primary key)" }]);
			}
			if (sql.includes("ORDER BY c.ORDINAL_POSITION")) {
				return rows([
					{
						columnName: "id",
						dataType: "int",
						columnType: "int",
						isNullable: 0,
						columnDefault: null,
						isPrimaryKey: 1,
						isForeignKey: 0,
						referencedTable: null,
						referencedColumn: null,
					},
					{
						columnName: "status",
						dataType: "enum",
						columnType: "enum('active','inactive')",
						isNullable: 1,
						columnDefault: "active",
						isPrimaryKey: 0,
						isForeignKey: 0,
						referencedTable: null,
						referencedColumn: null,
					},
					{
						columnName: "group_id",
						dataType: "int",
						columnType: "int",
						isNullable: 1,
						columnDefault: null,
						isPrimaryKey: 0,
						isForeignKey: 1,
						referencedTable: "groups",
						referencedColumn: "id",
					},
				]);
			}
			if (sql.includes("information_schema.COLUMNS") && sql.includes("COLUMN_NAME = ?")) {
				return rows([{ cnt: values?.[1] === "age" || values?.[1] === "fullName" ? 0 : 1 }]);
			}
			if (sql.includes("SELECT EXTRA FROM information_schema.COLUMNS")) {
				return rows([{ EXTRA: "" }]);
			}
			if (sql.includes("KEY_COLUMN_USAGE") && sql.includes("REFERENCED_TABLE_NAME = ?")) {
				return rows([]);
			}
			if (sql.includes("COLUMNS")) {
				return rows([
					{
						columnName: "id",
						dataType: "int",
						columnType: "int",
						isNullable: 0,
						columnDefault: null,
						isPrimaryKey: 1,
						isForeignKey: 0,
						referencedTable: null,
						referencedColumn: null,
					},
					{
						columnName: "status",
						dataType: "enum",
						columnType: "enum('active','inactive')",
						isNullable: 1,
						columnDefault: "active",
						isPrimaryKey: 0,
						isForeignKey: 0,
						referencedTable: null,
						referencedColumn: null,
					},
				]);
			}
			if (sql.startsWith("INSERT INTO")) return ok(1);
			if (sql.startsWith("UPDATE")) return ok(1);
			if (sql.startsWith("DELETE")) return ok(1);
			if (sql.startsWith("DROP TABLE") || sql.startsWith("CREATE TABLE")) return ok(0);
			if (sql.startsWith("ALTER TABLE")) return ok(1);
			if (sql === "SELECT 1") return rows([{ id: 1 }], [{ name: "id" }]);

			return ok(1);
		}),
	};

	return { pool, connection };
}

describe("MySqlAdapter integration scaffold", () => {
	let adapter: MySqlAdapter;
	let pool: ReturnType<typeof createMysqlPool>["pool"];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MySqlAdapter();
		pool = createMysqlPool().pool;
		mockGetMysqlPool.mockReturnValue(pool);
	});
	it("builds the paginated data query and maps column types", async () => {
		const cursor = (
			adapter as unknown as {
				encodeCursor: (data: { values: Record<string, unknown>; sortColumns: string[] }) => string;
			}
		).encodeCursor({ values: { id: 1 }, sortColumns: ["id"] });

		const helper = adapter as unknown as {
			buildTableDataQuery: (params: Record<string, unknown>) => {
				sql: string;
				values: unknown[];
			};
		};

		expect(
			helper.buildTableDataQuery({
				db: "appdb",
				tableName: "users",
				limit: 1,
				cursor,
				direction: "desc",
				sort: [{ columnName: "name", direction: "asc" }],
				filters: [{ columnName: "name", operator: "like", value: "%a%" }],
			}).sql,
		).toContain("ORDER BY `name` DESC");
		expect(
			helper.buildTableDataQuery({
				db: "appdb",
				tableName: "users",
				sort: "id",
				order: "desc",
				direction: "asc",
				filters: [{ columnName: "active", operator: "=", value: "true" }],
				cursor,
			}).values,
		).toEqual(["true", 1]);
		expect(adapter.mapFromUniversalType("text")).toBe("LONGTEXT");
		expect(adapter.mapFromUniversalType("number")).toBe("INT");
		expect(adapter.mapFromUniversalType("boolean")).toBe("TINYINT(1)");
		expect(adapter.mapFromUniversalType("date")).toBe("DATETIME");
		expect(adapter.mapFromUniversalType("array")).toBe("JSON");
		expect(adapter.mapFromUniversalType("enum")).toBe("TEXT");
		expect(adapter.mapFromUniversalType("unknown")).toBe("LONGTEXT");
		expect(adapter.mapToUniversalType("bool")).toBe("boolean");
		expect(adapter.mapToUniversalType("json")).toBe("json");
		expect(adapter.mapToUniversalType("datetime")).toBe("date");
	});

	describe("getDatabasesList system filtering", () => {
		it("sends a query that excludes system schemas but keeps DATABASE()", async () => {
			await adapter.getDatabasesList();
			const dbQuery = pool.execute.mock.calls
				.map((call) => String(call[0]))
				.find((sql) => sql.includes("information_schema.SCHEMATA"));
			expect(dbQuery).toContain("NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')");
			expect(dbQuery).toContain("DATABASE()");
		});
	});
});

describe("MySqlAdapter.renameTable", () => {
	let adapter: MySqlAdapter;
	let statements: string[];
	const existing = ["users", "orders", "we`ird"];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MySqlAdapter();
		statements = [];
		const pool = {
			getConnection: vi.fn(),
			execute: vi.fn(async (sql: string, values?: unknown[]) => {
				const text = String(sql);
				statements.push(text);
				if (text.includes("information_schema.TABLES") && text.includes("COUNT(*) as cnt")) {
					return rows([{ cnt: existing.includes(values?.[0] as string) ? 1 : 0 }]);
				}
				return ok(1);
			}),
		};
		mockGetMysqlPool.mockReturnValue(pool);
	});

	it("renames an existing table with RENAME TABLE", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe("RENAME TABLE `users` TO `members`");
	});

	it("escapes backticks in identifiers", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "we`ird", newTableName: "ok" });
		expect(statements.at(-1)).toBe("RENAME TABLE `we``ird` TO `ok`");
	});
});
