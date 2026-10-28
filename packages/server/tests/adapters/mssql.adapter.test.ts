import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMssqlPool = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getMssqlPool: mockGetMssqlPool,
}));

import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";

const recordset = (data: unknown[] = [], rowsAffected = [data.length]) => ({
	recordset: data,
	rowsAffected,
});

const tableDataRows = [
	{ id: 1, name: "Ada" },
	{ id: 2, name: "Linus" },
];

function responseFor(sqlInput: string, params: Record<string, unknown> = {}) {
	const sql = String(sqlInput);

	if (sql.includes("FROM sys.databases")) {
		return recordset([{ name: "appdb", size: "1 MB", owner: "sa", encoding: "SQL_Latin" }]);
	}
	if (sql.includes("DB_NAME() AS db")) return recordset([{ db: "appdb" }]);
	if (sql.includes("@@VERSION")) {
		return recordset([
			{
				version: "SQL Server 2022",
				database_name: "appdb",
				user: "sa",
				host: "localhost",
				port: 1433,
				active_connections: 1,
				max_connections: 32767,
			},
		]);
	}
	if (sql.includes("FROM information_schema.tables") && sql.includes("table_name AS tableName")) {
		return recordset([{ tableName: "users" }]);
	}
	if (sql.includes("SELECT COUNT(*) as count FROM [users]")) return recordset([{ count: 2 }]);
	if (sql.includes("SELECT COUNT(*) as total")) return recordset([{ total: 2 }]);
	if (sql.includes("SELECT * FROM [users]")) return recordset(tableDataRows);
	if (sql.includes("INFORMATION_SCHEMA.TABLES") && sql.includes("COUNT(*) as cnt")) {
		return recordset([{ cnt: 1 }]);
	}
	if (sql.includes("INFORMATION_SCHEMA.COLUMNS") && sql.includes("AS KEY_TYPE")) {
		return recordset([
			{
				COLUMN_NAME: "id",
				DATA_TYPE: "int",
				CHARACTER_MAXIMUM_LENGTH: null,
				NUMERIC_PRECISION: null,
				NUMERIC_SCALE: null,
				IS_NULLABLE: "NO",
				COLUMN_DEFAULT: null,
			},
			{
				COLUMN_NAME: "name",
				DATA_TYPE: "nvarchar",
				CHARACTER_MAXIMUM_LENGTH: -1,
				NUMERIC_PRECISION: null,
				NUMERIC_SCALE: null,
				IS_NULLABLE: "YES",
				COLUMN_DEFAULT: null,
			},
			{
				COLUMN_NAME: "price",
				DATA_TYPE: "decimal",
				CHARACTER_MAXIMUM_LENGTH: null,
				NUMERIC_PRECISION: 10,
				NUMERIC_SCALE: 2,
				IS_NULLABLE: "NO",
				COLUMN_DEFAULT: "((0))",
			},
			{
				COLUMN_NAME: "score",
				DATA_TYPE: "numeric",
				CHARACTER_MAXIMUM_LENGTH: null,
				NUMERIC_PRECISION: 8,
				NUMERIC_SCALE: null,
				IS_NULLABLE: "YES",
				COLUMN_DEFAULT: null,
			},
		]);
	}
	if (sql.includes("CHECK_CONSTRAINTS")) return recordset([]);
	if (sql.includes("c.COLUMN_NAME AS columnName")) {
		return recordset([
			{
				columnName: "id",
				dataType: "int",
				isNullable: 0,
				columnDefault: null,
				isPrimaryKey: 1,
				isForeignKey: 0,
				referencedTable: null,
				referencedColumn: null,
			},
		]);
	}
	if (sql.includes("INFORMATION_SCHEMA.COLUMNS") && sql.includes("COUNT(*) as cnt")) {
		const columnName = params.columnName;
		return recordset([{ cnt: columnName === "age" || columnName === "fullName" ? 0 : 1 }]);
	}
	if (sql.includes("sys.default_constraints")) return recordset([]);
	if (sql.includes("sys.foreign_keys")) return recordset([]);
	if (sql.includes("is_identity = 1")) return recordset([]);
	if (sql.startsWith("INSERT INTO")) return recordset([], [1]);
	if (sql.startsWith("UPDATE")) return recordset([], [1]);
	if (sql.startsWith("DELETE")) return recordset([], [1]);
	if (sql.startsWith("DROP TABLE") || sql.startsWith("CREATE TABLE")) return recordset([], [0]);
	if (sql.startsWith("ALTER TABLE") || sql.startsWith("EXEC sp_rename")) {
		return recordset([], [1]);
	}
	if (sql === "SELECT 1") return recordset([{ id: 1 }], [1]);

	return recordset([], [1]);
}

function createRequest() {
	const params: Record<string, unknown> = {};
	const request = {
		input: vi.fn(),
		query: vi.fn(async (sql: string) => responseFor(sql, params)),
	};
	request.input.mockImplementation((name: string, value: unknown) => {
		params[name] = value;
		return request;
	});
	return request;
}

function createMssqlPool() {
	const transaction = {
		begin: vi.fn(async () => undefined),
		commit: vi.fn(async () => undefined),
		rollback: vi.fn(async () => undefined),
		request: vi.fn(() => createRequest()),
	};
	const pool = {
		request: vi.fn(() => createRequest()),
		transaction: vi.fn(() => transaction),
	};
	return { pool, transaction };
}

describe("MsSqlAdapter integration scaffold", () => {
	let adapter: MsSqlAdapter;
	let pool: ReturnType<typeof createMssqlPool>["pool"];

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MsSqlAdapter();
		pool = createMssqlPool().pool;
		mockGetMssqlPool.mockResolvedValue(pool);
	});
	it("builds the paginated OFFSET/FETCH query and maps column types", async () => {
		const helper = adapter as unknown as {
			buildTableDataQuery: (params: Record<string, unknown>) => {
				sql: string;
				values: unknown[];
			};
			makeCursor: (offset: number) => string;
		};
		const cursor = helper.makeCursor(2);

		expect(
			helper.buildTableDataQuery({
				db: "appdb",
				tableName: "users",
				limit: 1,
				cursor,
				sort: [{ columnName: "name", direction: "desc" }],
				filters: [{ columnName: "name", operator: "like", value: "%a%" }],
			}),
		).toMatchObject({
			values: ["%a%", 2, 2],
		});
		expect(
			helper.buildTableDataQuery({ db: "appdb", tableName: "users", limit: 5 }).sql,
		).toContain("ORDER BY (SELECT NULL)");

		expect(adapter.mapFromUniversalType("text")).toBe("NVARCHAR(MAX)");
		expect(adapter.mapFromUniversalType("number")).toBe("INT");
		expect(adapter.mapFromUniversalType("boolean")).toBe("BIT");
		expect(adapter.mapFromUniversalType("date")).toBe("DATETIME2");
		expect(adapter.mapFromUniversalType("array")).toBe("NVARCHAR(MAX)");
		expect(adapter.mapFromUniversalType("enum")).toBe("NVARCHAR(255)");
		expect(adapter.mapFromUniversalType("unknown")).toBe("NVARCHAR(MAX)");
		expect(adapter.mapToUniversalType("bit")).toBe("boolean");
		expect(adapter.mapToUniversalType("nvarchar")).toBe("text");
		expect(adapter.mapToUniversalType("datetime2")).toBe("date");
	});

	describe("getDatabasesList system filtering", () => {
		it("sends a query that keeps system DBs only when current via DB_NAME()", async () => {
			const request = createRequest();
			pool.request.mockReturnValue(request);
			await adapter.getDatabasesList();
			const dbQuery = request.query.mock.calls
				.map((call) => String(call[0]))
				.find((sql) => sql.includes("FROM sys.databases"));
			expect(dbQuery).toContain("d.database_id > 4");
			expect(dbQuery).toContain("DB_NAME()");
		});
	});
});

describe("MsSqlAdapter.renameTable", () => {
	let adapter: MsSqlAdapter;
	let statements: string[];
	let boundParams: Record<string, unknown>[];
	const existing = ["users", "orders"];

	const createRenamePool = () => {
		const pool = {
			request: vi.fn(() => {
				const params: Record<string, unknown> = {};
				boundParams.push(params);
				const req = {
					input: vi.fn((name: string, value: unknown) => {
						params[name] = value;
						return req;
					}),
					query: vi.fn(async (sql: string) => {
						const text = String(sql);
						statements.push(text);
						if (text.includes("INFORMATION_SCHEMA.TABLES") && text.includes("COUNT(*) as cnt")) {
							return {
								recordset: [{ cnt: existing.includes(params.tableName as string) ? 1 : 0 }],
								rowsAffected: [0],
							};
						}
						return { recordset: [], rowsAffected: [1] };
					}),
				};
				return req;
			}),
		};
		return pool;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MsSqlAdapter();
		statements = [];
		boundParams = [];
		mockGetMssqlPool.mockResolvedValue(createRenamePool());
	});

	it("renames via parameterized sp_rename (no string interpolation)", async () => {
		await adapter.renameTable({ db: "appdb", tableName: "users", newTableName: "members" });
		expect(statements.at(-1)).toBe("EXEC sp_rename @oldName, @newName");
		const renameParams = boundParams.at(-1);
		expect(renameParams).toMatchObject({ oldName: "users", newName: "members" });
	});
});
