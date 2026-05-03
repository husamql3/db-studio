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

	it("executes every IDbAdapter method on the MSSQL pool happy path", async () => {
		expect(await adapter.getDatabasesList()).toHaveLength(1);
		expect(await adapter.getCurrentDatabase()).toEqual({ db: "appdb" });
		expect((await adapter.getDatabaseConnectionInfo()).port).toBe(1433);
		expect(await adapter.getTablesList("appdb")).toEqual([
			{ tableName: "users", rowCount: 2 },
		]);

		await adapter.createTable({
			db: "appdb",
			tableData: {
				tableName: "users",
				fields: [
					{ columnName: "id", columnType: "integer", isPrimaryKey: true },
					{
						columnName: "email",
						columnType: "varchar",
						isUnique: true,
						isNullable: false,
						defaultValue: "'n/a'",
					},
					{ columnName: "tags", columnType: "text", isArray: true, isNullable: true },
					{ columnName: "serial_no", columnType: "integer", isIdentity: true },
				],
				foreignKeys: [
					{
						columnName: "group_id",
						referencedTable: "groups",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "SET NULL",
					},
				],
			} as never,
		});
		expect(await adapter.deleteTable({ db: "appdb", tableName: "users", cascade: true })).toEqual(
			{ deletedCount: 2, fkViolation: false, relatedRecords: [] },
		);
		expect(await adapter.getTableSchema({ db: "appdb", tableName: "users" })).toContain(
			"CREATE TABLE [users]",
		);
		expect(await adapter.getTableColumns({ db: "appdb", tableName: "users" })).toHaveLength(1);

		await adapter.addColumn({
			db: "appdb",
			tableName: "users",
			columnName: "age",
			columnType: "integer",
			defaultValue: "18",
			isUnique: true,
			isNullable: true,
		} as never);
		expect(
			await adapter.deleteColumn({ db: "appdb", tableName: "users", columnName: "name" }),
		).toEqual({ deletedCount: 1 });
		await adapter.alterColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			columnType: "NVARCHAR(MAX)",
			isNullable: true,
		} as never);
		await adapter.renameColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			newColumnName: "fullName",
		});

		expect(
			await adapter.getTableData({ db: "appdb", tableName: "users", limit: 2, sort: "id" }),
		).toMatchObject({ meta: { total: 2 }, data: tableDataRows });
		expect(
			await adapter.exportTableData({ db: "appdb", tableName: "users" }),
		).toMatchObject({ cols: ["id", "name"], rows: tableDataRows });
		expect(
			await adapter.addRecord({
				db: "appdb",
				params: { tableName: "users", data: { name: "Ada" } },
			} as never),
		).toEqual({ insertedCount: 1 });
		expect(
			await adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Grace", rowData: { id: 1 } }],
				},
			} as never),
		).toEqual({ updatedCount: 1 });
		expect(
			await adapter.deleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			}),
		).toEqual({ deletedCount: 1, fkViolation: false, relatedRecords: [] });
		expect(
			await adapter.forceDeleteRecords({
				db: "appdb",
				tableName: "users",
				primaryKeys: [{ columnName: "id", value: 1 }],
			}),
		).toEqual({ deletedCount: 1 });
		expect(
			await adapter.bulkInsertRecords({
				db: "appdb",
				tableName: "users",
				records: [{ name: "Ada" }],
			}),
		).toMatchObject({ success: true, successCount: 1, failureCount: 0 });
		expect(await adapter.executeQuery({ db: "appdb", query: "SELECT 1;" })).toMatchObject({
			columns: ["id"],
			rowCount: 1,
		});
		expect(adapter.mapToUniversalType("int")).toBe("number");
		expect(adapter.mapFromUniversalType("json")).toBe("NVARCHAR(MAX)");
		expect(pool.request).toHaveBeenCalled();
	});

	it("covers MSSQL cursor pagination and protected query helpers", async () => {
		const helper = adapter as unknown as {
			buildTableDataQuery: (params: Record<string, unknown>) => {
				sql: string;
				values: unknown[];
			};
			buildCursors: (
				params: Record<string, unknown>,
				rows: Record<string, unknown>[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
			quoteIdentifier: (name: string) => string;
			makeCursor: (offset: number) => string;
			decodeOffsetCursor: (cursor: string) => number;
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
		expect(helper.buildCursors({ limit: 2 }, [], true).nextCursor).toEqual(expect.any(String));
		expect(helper.buildCursors({ limit: 2, cursor }, [], false).prevCursor).toEqual(expect.any(String));
		expect(helper.quoteIdentifier("users")).toBe("[users]");
		expect(helper.decodeOffsetCursor("not-a-cursor")).toBe(0);

		expect(
			await adapter.getTableData({
				db: "appdb",
				tableName: "users",
				limit: 1,
				cursor,
				sort: [{ columnName: "id", direction: "desc" }],
				filters: [{ columnName: "name", operator: "ilike", value: "%a%" }],
			}),
		).toMatchObject({
			meta: {
				limit: 1,
				total: 2,
				hasNextPage: true,
				hasPreviousPage: true,
			},
		});

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

	it("covers MSSQL validation and error branches", async () => {
		const requestReturning = (data: unknown[], rowsAffected = [data.length]) => {
			const request = {
				input: vi.fn(),
				query: vi.fn(async () => recordset(data, rowsAffected)),
			};
			request.input.mockReturnValue(request);
			return request;
		};

		pool.request.mockReturnValueOnce(requestReturning([]));
		await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 500 });

		pool.request.mockReturnValueOnce(requestReturning([]));
		await expect(adapter.getCurrentDatabase()).rejects.toMatchObject({ status: 500 });

		pool.request.mockReturnValueOnce(requestReturning([]));
		await expect(adapter.getDatabaseConnectionInfo()).rejects.toMatchObject({ status: 500 });

		pool.request.mockReturnValueOnce(requestReturning([]));
		await expect(adapter.getTablesList("appdb")).resolves.toEqual([]);

		pool.request.mockReturnValueOnce(requestReturning([{ cnt: 0 }]));
		await expect(adapter.deleteTable({ db: "appdb", tableName: "missing" })).rejects.toMatchObject({
			status: 404,
		});

		pool.request.mockReturnValueOnce(requestReturning([{ cnt: 0 }]));
		await expect(
			adapter.getTableSchema({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.request.mockReturnValueOnce(requestReturning([]));
		await expect(
			adapter.getTableColumns({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.request.mockReturnValueOnce(requestReturning([{ cnt: 0 }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "missing",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 404 });

		pool.request
			.mockReturnValueOnce(requestReturning([{ cnt: 1 }]))
			.mockReturnValueOnce(requestReturning([{ cnt: 1 }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "users",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 409 });

		await expect(
			adapter.updateRecords({
				db: "appdb",
				params: {
					tableName: "users",
					primaryKey: "id",
					updates: [{ columnName: "name", value: "Ada", rowData: {} }],
				},
			} as never),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.deleteRecords({ db: "appdb", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.forceDeleteRecords({ db: "appdb", tableName: "users", primaryKeys: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			adapter.bulkInsertRecords({ db: "appdb", tableName: "users", records: [] }),
		).rejects.toMatchObject({ status: 400 });
		await expect(adapter.executeQuery({ db: "appdb", query: "" })).rejects.toMatchObject({
			status: 400,
		});
	});
});
