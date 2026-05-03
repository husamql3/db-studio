import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
	getTablesList: vi.fn(),
	createTable: vi.fn(),
	deleteTable: vi.fn(),
	getTableSchema: vi.fn(),
	getTableColumns: vi.fn(),
	addColumn: vi.fn(),
	deleteColumn: vi.fn(),
	alterColumn: vi.fn(),
	renameColumn: vi.fn(),
	getTableData: vi.fn(),
	addRecord: vi.fn(),
	updateRecords: vi.fn(),
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
	bulkInsertRecords: vi.fn(),
	exportTableData: vi.fn(),
	executeQuery: vi.fn(),
}));

vi.mock("@/dao/dao-factory.js", () => ({
	getDaoFactory: vi.fn(() => mockDao),
	executeDaoMethod: vi.fn(),
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
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
			mockDao.getTablesList.mockResolvedValue([
				{ tableName: "users", rowCount: 200 },
				{ tableName: "orders", rowCount: 1200 },
			]);

			const res = await app.request("/mssql/tables?db=testdb");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toHaveLength(2);
			expect(mockDao.getTablesList).toHaveBeenCalledWith("testdb");
		});

		it("returns 400 when db query is missing", async () => {
			const res = await app.request("/mssql/tables");
			expect(res.status).toBe(400);
		});
	});

	describe("POST /mssql/tables", () => {
		it("creates a table", async () => {
			mockDao.createTable.mockResolvedValue(undefined);

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
			mockDao.createTable.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433"),
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
			mockDao.deleteColumn.mockResolvedValue({ deletedCount: 0 });

			const res = await app.request("/mssql/tables/users/columns/email?db=testdb", {
				method: "DELETE",
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toContain('Column "email" deleted successfully');
		});

		it("returns 404 when table is not found", async () => {
			mockDao.deleteColumn.mockRejectedValue(
				new HTTPException(404, { message: "Table not found" }),
			);

			const res = await app.request("/mssql/tables/unknown/columns/email?db=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});
	});

	describe("GET /mssql/tables/:tableName/columns", () => {
		it("returns column metadata", async () => {
			mockDao.getTableColumns.mockResolvedValue([
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
			expect(mockDao.getTableColumns).toHaveBeenCalledWith({
				tableName: "users",
				db: "testdb",
			});
		});
	});

	describe("GET /mssql/tables/:tableName/data", () => {
		it("returns paginated table data", async () => {
			mockDao.getTableData.mockResolvedValue({
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
			expect(mockDao.getTableData).toHaveBeenCalledWith({
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
			mockDao.getTableData.mockResolvedValue({
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
				`/mssql/tables/users/data?db=testdb&limit=25&sort=created_at&order=desc&filters=${encodeURIComponent(filters)}`,
			);

			expect(res.status).toBe(200);
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 25,
					sort: "created_at",
					order: "desc",
					filters: [{ columnName: "status", operator: "=", value: "active" }],
				}),
			);
		});

		it("returns 500 on generic DAO error", async () => {
			mockDao.getTableData.mockRejectedValue(new Error("Unexpected SQL Server error"));

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
			mockDao.getTablesList.mockResolvedValue([]);
			const res = await app.request("/mssql/tables?db=testdb");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});

		it("handles concurrent table list requests", async () => {
			mockDao.getTablesList.mockResolvedValue([{ tableName: "users", rowCount: 10 }]);

			const responses = await Promise.all(
				Array.from({ length: 6 }, () => app.request("/mssql/tables?db=testdb")),
			);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mockDao.getTablesList).toHaveBeenCalledTimes(6);
		});
	});
});
