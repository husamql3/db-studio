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

	it("executes every IDbAdapter method on the MySQL pool happy path", async () => {
		expect(await adapter.getDatabasesList()).toHaveLength(1);
		expect(await adapter.getCurrentDatabase()).toEqual({ db: "appdb" });
		expect((await adapter.getDatabaseConnectionInfo()).port).toBe(3306);
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
			"CREATE TABLE",
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
			isArray: true,
		} as never);
		expect(
			await adapter.deleteColumn({ db: "appdb", tableName: "users", columnName: "name" }),
		).toEqual({ deletedCount: 1 });
		await adapter.alterColumn({
			db: "appdb",
			tableName: "users",
			columnName: "name",
			columnType: "text",
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
		expect(adapter.mapFromUniversalType("json")).toBe("JSON");
		expect(pool.execute).toHaveBeenCalled();
	});

	it("covers MySQL cursor pagination and protected query helpers", async () => {
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
			buildCursors: (
				params: Record<string, unknown>,
				rows: Record<string, unknown>[],
				hasMore: boolean,
			) => { nextCursor: string | null; prevCursor: string | null };
			quoteIdentifier: (name: string) => string;
			decodeCursor: (cursor: string) => unknown;
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
		expect(helper.buildCursors({ sort: "id", direction: "asc" }, [], false)).toEqual({
			nextCursor: null,
			prevCursor: null,
		});
		expect(
			helper.buildCursors({ sort: "id", direction: "desc", cursor }, [{ id: 1 }, { id: 2 }], true),
		).toEqual({ nextCursor: expect.any(String), prevCursor: expect.any(String) });
		expect(helper.quoteIdentifier("users")).toBe("`users`");
		expect(helper.decodeCursor("not-a-cursor")).toBeNull();

		expect(
			await adapter.getTableData({
				db: "appdb",
				tableName: "users",
				limit: 1,
				direction: "desc",
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

	it("covers MySQL validation and error branches", async () => {
		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 500 });

		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(adapter.getCurrentDatabase()).rejects.toMatchObject({ status: 500 });

		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(adapter.getDatabaseConnectionInfo()).rejects.toMatchObject({ status: 500 });

		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(adapter.getTablesList("appdb")).resolves.toEqual([]);

		pool.execute.mockResolvedValueOnce(rows([{ cnt: 0 }]));
		await expect(adapter.deleteTable({ db: "appdb", tableName: "missing" })).rejects.toMatchObject({
			status: 404,
		});

		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(
			adapter.getTableSchema({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.execute.mockResolvedValueOnce(rows([]));
		await expect(
			adapter.getTableColumns({ db: "appdb", tableName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

		pool.execute.mockResolvedValueOnce(rows([{ cnt: 0 }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "missing",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 404 });

		pool.execute
			.mockResolvedValueOnce(rows([{ cnt: 1 }]))
			.mockResolvedValueOnce(rows([{ cnt: 1 }]));
		await expect(
			adapter.addColumn({
				db: "appdb",
				tableName: "users",
				columnName: "age",
				columnType: "integer",
			} as never),
		).rejects.toMatchObject({ status: 409 });

		pool.execute
			.mockResolvedValueOnce(rows([{ cnt: 1 }]))
			.mockResolvedValueOnce(rows([{ cnt: 0 }]));
		await expect(
			adapter.deleteColumn({ db: "appdb", tableName: "users", columnName: "missing" }),
		).rejects.toMatchObject({ status: 404 });

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
