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

describe("Query Routes (MSSQL)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("POST /mssql/query", () => {
		it("executes SELECT query and returns result", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["id", "name"],
				rows: [{ id: 1, name: "Husam" }],
				rowCount: 1,
				duration: 7.4,
			});

			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT TOP 1 id, name FROM users" }),
			});
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.rowCount).toBe(1);
			expect(mockDao.executeQuery).toHaveBeenCalledWith({
				query: "SELECT TOP 1 id, name FROM users",
				db: "testdb",
			});
		});

		it("supports MSSQL syntax like TOP and brackets", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["id"],
				rows: [{ id: 42 }],
				rowCount: 1,
				duration: 4.2,
			});

			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT TOP 1 [id] FROM [dbo].[users]" }),
			});

			expect(res.status).toBe(200);
		});

		it("returns 400 when query payload is missing", async () => {
			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("returns 400 when db query param is missing", async () => {
			const res = await app.request("/mssql/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 503 when SQL Server connection fails", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433"),
			);

			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(503);
		});

		it("returns 500 on SQL syntax errors", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new Error("Incorrect syntax near 'SELEC'"),
			);

			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELEC * FROM users" }),
			});

			expect(res.status).toBe(500);
		});

		it("passes through HTTPException status", async () => {
			mockDao.executeQuery.mockRejectedValue(
				new HTTPException(500, { message: "Execution failed" }),
			);

			const res = await app.request("/mssql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(500);
		});
	});

	describe("Other behavior", () => {
		it("rejects invalid database type", async () => {
			const res = await app.request("/sqlite/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("returns 404 for unsupported methods", async () => {
			const res = await app.request("/mssql/query?db=testdb", { method: "GET" });
			expect(res.status).toBe(404);
		});

		it("handles concurrent requests", async () => {
			mockDao.executeQuery.mockResolvedValue({
				columns: ["value"],
				rows: [{ value: 1 }],
				rowCount: 1,
				duration: 1,
			});

			const responses = await Promise.all(
				Array.from({ length: 8 }, () =>
					app.request("/mssql/query?db=testdb", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ query: "SELECT 1 as value" }),
					}),
				),
			);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}
			expect(mockDao.executeQuery).toHaveBeenCalledTimes(8);
		});
	});
});
