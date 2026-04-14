import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mssqlTableListDao from "@/dao/mssql/table-list.mssql.dao.js";
import * as mssqlCreateTableDao from "@/dao/mssql/create-table.mssql.dao.js";
import * as mssqlDeleteColumnDao from "@/dao/mssql/delete-column.mssql.dao.js";
import * as mssqlTableColumnsDao from "@/dao/mssql/table-columns.mssql.dao.js";
import * as mssqlTablesDataDao from "@/dao/mssql/tables-data.mssql.dao.js";

vi.mock("@/dao/mssql/table-list.mssql.dao.js", () => ({ getTablesList: vi.fn() }));
vi.mock("@/dao/mssql/create-table.mssql.dao.js", () => ({ createTable: vi.fn() }));
vi.mock("@/dao/mssql/delete-column.mssql.dao.js", () => ({ deleteColumn: vi.fn() }));
vi.mock("@/dao/mssql/table-columns.mssql.dao.js", () => ({ getTableColumns: vi.fn() }));
vi.mock("@/dao/mssql/tables-data.mssql.dao.js", () => ({ getTableData: vi.fn() }));
vi.mock("@/dao/mssql/delete-table.mssql.dao.js", () => ({ deleteTable: vi.fn() }));
vi.mock("@/dao/mssql/table-schema.mssql.dao.js", () => ({ getTableSchema: vi.fn() }));
vi.mock("@/dao/mssql/export-table.mssql.dao.js", () => ({ exportTableData: vi.fn() }));

vi.mock("@/dao/table-list.dao.js", () => ({ getTablesList: vi.fn() }));
vi.mock("@/dao/create-table.dao.js", () => ({ createTable: vi.fn() }));
vi.mock("@/dao/delete-column.dao.js", () => ({ deleteColumn: vi.fn() }));
vi.mock("@/dao/table-columns.dao.js", () => ({ getTableColumns: vi.fn() }));
vi.mock("@/dao/tables-data.dao.js", () => ({ getTableData: vi.fn() }));
vi.mock("@/dao/delete-table.dao.js", () => ({ deleteTable: vi.fn() }));
vi.mock("@/dao/table-schema.dao.js", () => ({ getTableSchema: vi.fn() }));
vi.mock("@/dao/export-table.dao.js", () => ({ exportTableData: vi.fn() }));

vi.mock("@/dao/mysql/table-list.mysql.dao.js", () => ({ getTablesList: vi.fn() }));
vi.mock("@/dao/mysql/create-table.mysql.dao.js", () => ({ createTable: vi.fn() }));
vi.mock("@/dao/mysql/delete-column.mysql.dao.js", () => ({ deleteColumn: vi.fn() }));
vi.mock("@/dao/mysql/table-columns.mysql.dao.js", () => ({ getTableColumns: vi.fn() }));
vi.mock("@/dao/mysql/tables-data.mysql.dao.js", () => ({ getTableData: vi.fn() }));
vi.mock("@/dao/mysql/delete-table.mysql.dao.js", () => ({ deleteTable: vi.fn() }));
vi.mock("@/dao/mysql/table-schema.mysql.dao.js", () => ({ getTableSchema: vi.fn() }));
vi.mock("@/dao/mysql/export-table.mysql.dao.js", () => ({ exportTableData: vi.fn() }));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
}));

describe("Tables Routes (MSSQL)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("GET /mssql/tables", () => {
		it("returns table list", async () => {
			vi.mocked(mssqlTableListDao.getTablesList).mockResolvedValue([
				{ tableName: "users", rowCount: 200 },
				{ tableName: "orders", rowCount: 1200 },
			]);

			const res = await app.request("/mssql/tables?db=testdb");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toHaveLength(2);
			expect(mssqlTableListDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("returns 400 when db query is missing", async () => {
			const res = await app.request("/mssql/tables");
			expect(res.status).toBe(400);
		});
	});

	describe("POST /mssql/tables", () => {
		it("creates a table", async () => {
			vi.mocked(mssqlCreateTableDao.createTable).mockResolvedValue(undefined);

			const res = await app.request("/mssql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "employees",
					fields: [
						{ columnName: "id", columnType: "INT", isPrimaryKey: true, isNullable: false },
						{ columnName: "name", columnType: "NVARCHAR(255)", isNullable: false },
					],
				}),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toContain("employees");
		});

		it("returns 503 when SQL Server connection fails", async () => {
			vi.mocked(mssqlCreateTableDao.createTable).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433")
			);

			const res = await app.request("/mssql/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					tableName: "employees",
					fields: [{ columnName: "id", columnType: "INT" }],
				}),
			});

			expect(res.status).toBe(503);
		});
	});

	describe("DELETE /mssql/tables/:tableName/columns/:columnName", () => {
		it("deletes a column", async () => {
			vi.mocked(mssqlDeleteColumnDao.deleteColumn).mockResolvedValue({ deletedCount: 0 });

			const res = await app.request("/mssql/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toContain('Column "email" deleted successfully');
		});

		it("returns 404 when table is not found", async () => {
			vi.mocked(mssqlDeleteColumnDao.deleteColumn).mockRejectedValue(
				new HTTPException(404, { message: "Table not found" })
			);

			const res = await app.request("/mssql/tables/unknown/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});
	});

	describe("GET /mssql/tables/:tableName/columns", () => {
		it("returns column metadata", async () => {
			vi.mocked(mssqlTableColumnsDao.getTableColumns).mockResolvedValue([
				{
					columnName: "id",
					dataType: "number",
					dataTypeLabel: "int",
					isNullable: false,
					columnDefault: null,
					isPrimaryKey: true,
					isForeignKey: false,
					referencedTable: null,
					referencedColumn: null,
					enumValues: null,
				},
			]);

			const res = await app.request("/mssql/tables/users/columns?db=testdb");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data[0].columnName).toBe("id");
			expect(mssqlTableColumnsDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});
	});

	describe("GET /mssql/tables/:tableName/data", () => {
		it("returns paginated table data", async () => {
			vi.mocked(mssqlTablesDataDao.getTableData).mockResolvedValue({
				data: [{ id: 1, name: "User 1" }],
				meta: {
					limit: 50,
					total: 1,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const res = await app.request("/mssql/tables/users/data?db=testdb");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.meta.total).toBe(1);
			expect(mssqlTablesDataDao.getTableData).toHaveBeenCalledWith({
				tableName: "users",
				cursor: undefined,
				limit: 50,
				direction: "asc",
				sort: "",
				order: undefined,
				filters: [],
				db: "testdb",
			});
		});

		it("accepts sort and filters payload", async () => {
			vi.mocked(mssqlTablesDataDao.getTableData).mockResolvedValue({
				data: [],
				meta: {
					limit: 25,
					total: 0,
					hasNextPage: false,
					hasPreviousPage: false,
					nextCursor: null,
					prevCursor: null,
				},
			});

			const filters = JSON.stringify([{ columnName: "status", operator: "=", value: "active" }]);
			const res = await app.request(
				`/mssql/tables/users/data?db=testdb&limit=25&sort=created_at&order=desc&filters=${encodeURIComponent(filters)}`
			);

			expect(res.status).toBe(200);
			expect(mssqlTablesDataDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 25,
					sort: "created_at",
					order: "desc",
					filters: [{ columnName: "status", operator: "=", value: "active" }],
				})
			);
		});

		it("returns 500 on generic DAO error", async () => {
			vi.mocked(mssqlTablesDataDao.getTableData).mockRejectedValue(
				new Error("Unexpected SQL Server error")
			);

			const res = await app.request("/mssql/tables/users/data?db=testdb");
			expect(res.status).toBe(500);
		});
	});

	describe("Route behavior", () => {
		it("rejects unsupported database types", async () => {
			const res = await app.request("/sqlite/tables?db=testdb");
			expect(res.status).toBe(400);
		});

		it("includes CORS + JSON headers", async () => {
			vi.mocked(mssqlTableListDao.getTablesList).mockResolvedValue([]);
			const res = await app.request("/mssql/tables?db=testdb");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});

		it("handles concurrent table list requests", async () => {
			vi.mocked(mssqlTableListDao.getTablesList).mockResolvedValue([
				{ tableName: "users", rowCount: 10 },
			]);

			const responses = await Promise.all(
				Array.from({ length: 6 }, () => app.request("/mssql/tables?db=testdb"))
			);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mssqlTableListDao.getTablesList).toHaveBeenCalledTimes(6);
		});
	});
});
