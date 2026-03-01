import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mysqlQueryDao from "@/dao/mysql/query.mysql.dao.js";

// Mock MySQL query DAO
vi.mock("@/dao/mysql/query.mysql.dao.js", () => ({
	executeQuery: vi.fn(),
}));

// Mock PG query DAO (imported by route but not called for /mysql/ paths)
vi.mock("@/dao/query.dao.js", () => ({
	executeQuery: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getDbType: vi.fn(() => "mysql"),
}));

describe("Query Routes (MySQL)", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// POST /mysql/query - Execute SQL query
	// ============================================
	describe("POST /mysql/query", () => {
		it("should execute a SELECT query and return results with 200 status", async () => {
			const mockResult = {
				columns: ["id", "name", "email"],
				rows: [
					{ id: 1, name: "John", email: "john@example.com" },
					{ id: 2, name: "Jane", email: "jane@example.com" },
				],
				rowCount: 2,
				duration: 12.3,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockResult);
			expect(mysqlQueryDao.executeQuery).toHaveBeenCalledWith({
				query: "SELECT * FROM users",
				db: "testdb",
			});
		});

		it("should execute an INSERT query and return affected rows", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 1,
				duration: 5.2,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "INSERT INTO users (name) VALUES ('Alice')",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(1);
		});

		it("should execute an UPDATE query", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 3,
				duration: 4.1,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "UPDATE users SET status = 'active' WHERE created_at > '2024-01-01'",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(3);
		});

		it("should execute a DELETE query", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 2,
				duration: 3.5,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "DELETE FROM sessions WHERE expired_at < NOW()",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(2);
		});

		it("should execute a MySQL-specific query with backtick identifiers", async () => {
			const mockResult = {
				columns: ["id", "name"],
				rows: [{ id: 1, name: "Test" }],
				rowCount: 1,
				duration: 8.7,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT `id`, `name` FROM `users` WHERE `id` = 1",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows).toHaveLength(1);
		});

		it("should execute SHOW TABLES query", async () => {
			const mockResult = {
				columns: ["Tables_in_testdb"],
				rows: [
					{ "Tables_in_testdb": "users" },
					{ "Tables_in_testdb": "orders" },
					{ "Tables_in_testdb": "products" },
				],
				rowCount: 3,
				duration: 2.1,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SHOW TABLES" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(3);
		});

		it("should execute DESCRIBE TABLE query", async () => {
			const mockResult = {
				columns: ["Field", "Type", "Null", "Key", "Default", "Extra"],
				rows: [
					{ Field: "id", Type: "int", Null: "NO", Key: "PRI", Default: null, Extra: "auto_increment" },
					{ Field: "name", Type: "varchar(255)", Null: "YES", Key: "", Default: null, Extra: "" },
				],
				rowCount: 2,
				duration: 3.2,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "DESCRIBE users" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.columns).toContain("Field");
		});

		it("should return empty result set for SELECT with no matches", async () => {
			const mockResult = {
				columns: ["id", "name"],
				rows: [],
				rowCount: 0,
				duration: 1.5,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users WHERE id = -1" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows).toEqual([]);
			expect(json.data.rowCount).toBe(0);
		});

		it("should handle query with many columns", async () => {
			const columns = Array.from({ length: 20 }, (_, i) => `col_${i}`);
			const mockResult = {
				columns,
				rows: [Object.fromEntries(columns.map((c, i) => [c, i]))],
				rowCount: 1,
				duration: 6.4,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM wide_table LIMIT 1" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.columns).toHaveLength(20);
		});

		it("should handle multi-statement queries", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 15.0,
			};

			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SET @var = 1; SELECT @var as id" }),
			});

			expect(res.status).toBe(200);
		});

		it("should return 400 when query is missing", async () => {
			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("should call DAO when query is empty string (schema allows it)", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 0.5,
			});

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "" }),
			});

			// The schema allows empty strings — validation passes and DAO is called
			expect(res.status).toBe(200);
		});

		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/mysql/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when body is not JSON", async () => {
			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			});

			expect(res.status).toBe(400);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockRejectedValue(
				new HTTPException(500, {
					message: "You have an error in your SQL syntax",
				})
			);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FORM users" }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:3306")
			);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 500 when DAO throws generic error", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockRejectedValue(
				new Error("Unknown table 'users'")
			);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users" }),
			});

			expect(res.status).toBe(500);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});
	});

	// ============================================
	// HTTP methods validation
	// ============================================
	describe("HTTP methods validation", () => {
		it("should return 404 for GET /mysql/query", async () => {
			const res = await app.request("/mysql/query?db=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /mysql/query", async () => {
			const res = await app.request("/mysql/query?db=testdb", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 1.0,
			};
			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue({
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 1.0,
			});

			const res = await app.request("/mysql/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent query requests", async () => {
			vi.mocked(mysqlQueryDao.executeQuery).mockResolvedValue({
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 5.0,
			});

			const requests = Array.from({ length: 10 }, () =>
				app.request("/mysql/query?db=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: "SELECT 1" }),
				})
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(mysqlQueryDao.executeQuery).toHaveBeenCalledTimes(10);
		});
	});
});
