import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as queryDao from "@/dao/query.dao.js";

// Mock the DAO module
vi.mock("@/dao/query.dao.js", () => ({
	executeQuery: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
}));

describe("Query Routes", () => {
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
	// POST /query - Execute SQL query
	// ============================================
	describe("POST /pg/query", () => {
		it("should execute a SELECT query and return results with 200 status", async () => {
			const mockResult = {
				columns: ["id", "name", "email"],
				rows: [
					{ id: 1, name: "John", email: "john@example.com" },
					{ id: 2, name: "Jane", email: "jane@example.com" },
				],
				rowCount: 2,
				duration: 15.5,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockResult);
			expect(queryDao.executeQuery).toHaveBeenCalledWith({
				query: "SELECT * FROM users",
				database: "testdb",
			});
		});

		it("should execute an INSERT query and return result", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 8.2,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "INSERT INTO users (name, email) VALUES ('Test', 'test@example.com') RETURNING id",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rowCount).toBe(1);
		});

		it("should execute an UPDATE query and return result", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 5.3,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "UPDATE users SET name = 'Updated' WHERE id = 1",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK");
		});

		it("should execute a DELETE query and return result", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 3.1,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "DELETE FROM users WHERE id = 1",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK");
		});

		it("should handle query with empty result set", async () => {
			const mockResult = {
				columns: ["id", "name"],
				rows: [],
				rowCount: 0,
				duration: 2.5,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT * FROM users WHERE id = 9999",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows).toEqual([]);
			expect(json.data.rowCount).toBe(0);
		});

		it("should handle query with large result set", async () => {
			const mockRows = Array.from({ length: 1000 }, (_, i) => ({
				id: i + 1,
				name: `User ${i + 1}`,
			}));
			const mockResult = {
				columns: ["id", "name"],
				rows: mockRows,
				rowCount: 1000,
				duration: 150.7,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users LIMIT 1000" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows).toHaveLength(1000);
			expect(json.data.rowCount).toBe(1000);
		});

		it("should handle query with various data types", async () => {
			const mockResult = {
				columns: [
					"id",
					"name",
					"is_active",
					"score",
					"metadata",
					"tags",
					"created_at",
				],
				rows: [
					{
						id: 1,
						name: "Test",
						is_active: true,
						score: 99.5,
						metadata: { key: "value" },
						tags: ["a", "b", "c"],
						created_at: "2024-01-01T00:00:00Z",
					},
				],
				rowCount: 1,
				duration: 5.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM complex_table" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			const row = json.data.rows[0];
			expect(typeof row.id).toBe("number");
			expect(typeof row.is_active).toBe("boolean");
			expect(typeof row.score).toBe("number");
			expect(typeof row.metadata).toBe("object");
			expect(Array.isArray(row.tags)).toBe(true);
		});

		it("should handle query with null values", async () => {
			const mockResult = {
				columns: ["id", "name", "email"],
				rows: [{ id: 1, name: null, email: null }],
				rowCount: 1,
				duration: 3.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT * FROM users WHERE id = 1",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows[0].name).toBeNull();
			expect(json.data.rows[0].email).toBeNull();
		});

		it("should handle CREATE TABLE query", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 25.0,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query:
						"CREATE TABLE test_table (id SERIAL PRIMARY KEY, name VARCHAR(255))",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK");
		});

		it("should handle DROP TABLE query", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 10.0,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "DROP TABLE IF EXISTS test_table" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK");
		});

		it("should handle ALTER TABLE query", async () => {
			const mockResult = {
				columns: [],
				rows: [],
				rowCount: 0,
				duration: 15.0,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "ALTER TABLE users ADD COLUMN age INTEGER",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.message).toBe("OK");
		});

		it("should handle query with JOIN", async () => {
			const mockResult = {
				columns: ["user_id", "user_name", "order_id", "total"],
				rows: [
					{ user_id: 1, user_name: "John", order_id: 100, total: 50.0 },
					{ user_id: 1, user_name: "John", order_id: 101, total: 75.0 },
				],
				rowCount: 2,
				duration: 20.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query:
						"SELECT u.id as user_id, u.name as user_name, o.id as order_id, o.total FROM users u JOIN orders o ON u.id = o.user_id",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.columns).toContain("user_name");
			expect(json.data.columns).toContain("order_id");
		});

		it("should handle query with aggregation", async () => {
			const mockResult = {
				columns: ["count", "total_amount", "avg_amount"],
				rows: [{ count: 100, total_amount: 5000.0, avg_amount: 50.0 }],
				rowCount: 1,
				duration: 30.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query:
						"SELECT COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount FROM orders",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows[0].count).toBe(100);
		});

		it("should return duration in response", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 42.5,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1 as id" }),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.duration).toBe(42.5);
		});

		// ============================================
		// Validation errors
		// ============================================
		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/pg/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when query is missing from body", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when body is empty", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "",
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when body is invalid JSON", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "invalid json",
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when query is not a string", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: 123 }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when query is empty string", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new HTTPException(400, { message: "Query is required" })
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 when query is only whitespace", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new HTTPException(400, { message: "Query is required" })
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "   " }),
			});

			expect(res.status).toBe(400);
		});

		// ============================================
		// Database errors
		// ============================================
		it("should return 500 when SQL syntax error occurs", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error('syntax error at or near "SELEC"')
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELEC * FROM users" }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 500 when table does not exist", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error('relation "nonexistent_table" does not exist')
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM nonexistent_table" }),
			});

			expect(res.status).toBe(500);
		});

		it("should return 500 when column does not exist", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error('column "nonexistent_column" does not exist')
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT nonexistent_column FROM users",
				}),
			});

			expect(res.status).toBe(500);
		});

		it("should return 500 when constraint violation occurs", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error("duplicate key value violates unique constraint")
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query:
						"INSERT INTO users (id, email) VALUES (1, 'existing@example.com')",
				}),
			});

			expect(res.status).toBe(500);
		});

		it("should return 500 when foreign key violation occurs", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error("violates foreign key constraint")
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "INSERT INTO orders (user_id) VALUES (9999)",
				}),
			});

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:5432")
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new Error("timeout expired")
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(503);
		});

		it("should return 500 when HTTPException is thrown", async () => {
			vi.mocked(queryDao.executeQuery).mockRejectedValue(
				new HTTPException(500, { message: "Internal server error" })
			);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(500);
		});
	});

	// ============================================
	// Invalid database type validation
	// ============================================
	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 for mysql database type (not supported)", async () => {
			const res = await app.request("/mysql/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/query?database=testdb", {
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
		it("should return 404 for GET /query", async () => {
			const res = await app.request("/pg/query?database=testdb");

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /query", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for DELETE /query", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("should return 404 for PATCH /query", async () => {
			const res = await app.request("/pg/query?database=testdb", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1" }),
			});

			expect(res.status).toBe(404);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			vi.mocked(queryDao.executeQuery).mockResolvedValue({
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 1.0,
			});

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1 as id" }),
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			vi.mocked(queryDao.executeQuery).mockResolvedValue({
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 1.0,
			});

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1 as id" }),
			});

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	// ============================================
	// Concurrent requests handling
	// ============================================
	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent query requests", async () => {
			vi.mocked(queryDao.executeQuery).mockResolvedValue({
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 5.0,
			});

			const requests = Array.from({ length: 10 }, () =>
				app.request("/pg/query?database=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: "SELECT 1 as id" }),
				})
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(queryDao.executeQuery).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests with different queries", async () => {
			vi.mocked(queryDao.executeQuery).mockImplementation(async ({ query }) => {
				if (query.includes("users")) {
					return {
						columns: ["id", "name"],
						rows: [{ id: 1, name: "John" }],
						rowCount: 1,
						duration: 5.0,
					};
				}
				return {
					columns: ["id", "total"],
					rows: [{ id: 1, total: 100 }],
					rowCount: 1,
					duration: 3.0,
				};
			});

			const [res1, res2] = await Promise.all([
				app.request("/pg/query?database=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: "SELECT * FROM users" }),
				}),
				app.request("/pg/query?database=testdb", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: "SELECT * FROM orders" }),
				}),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);

			const json1 = await res1.json();
			const json2 = await res2.json();

			expect(json1.data.columns).toContain("name");
			expect(json2.data.columns).toContain("total");
		});
	});

	// ============================================
	// Edge cases
	// ============================================
	describe("Edge cases", () => {
		it("should handle query with unicode characters", async () => {
			const mockResult = {
				columns: ["name"],
				rows: [{ name: "日本語テスト" }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT '日本語テスト' as name",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows[0].name).toBe("日本語テスト");
		});

		it("should handle query with special SQL characters", async () => {
			const mockResult = {
				columns: ["text"],
				rows: [{ text: "It's a test" }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT 'It''s a test' as text",
				}),
			});

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.rows[0].text).toBe("It's a test");
		});

		it("should handle very long query", async () => {
			const longCondition = Array.from(
				{ length: 100 },
				(_, i) => `id = ${i}`
			).join(" OR ");
			const longQuery = `SELECT * FROM users WHERE ${longCondition}`;

			const mockResult = {
				columns: ["id"],
				rows: [],
				rowCount: 0,
				duration: 50.0,
				message: "OK",
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: longQuery }),
			});

			expect(res.status).toBe(200);
		});

		it("should handle query with comments", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "-- This is a comment\nSELECT 1 as id /* inline comment */",
				}),
			});

			expect(res.status).toBe(200);
		});

		it("should handle query with trailing semicolon", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1 as id;" }),
			});

			expect(res.status).toBe(200);
		});

		it("should handle query with multiple trailing semicolons", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT 1 as id;;;" }),
			});

			expect(res.status).toBe(200);
		});

		it("should handle query with newlines", async () => {
			const mockResult = {
				columns: ["id", "name"],
				rows: [{ id: 1, name: "Test" }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "SELECT\n  id,\n  name\nFROM\n  users\nWHERE\n  id = 1",
				}),
			});

			expect(res.status).toBe(200);
		});

		it("should handle query with tabs and extra whitespace", async () => {
			const mockResult = {
				columns: ["id"],
				rows: [{ id: 1 }],
				rowCount: 1,
				duration: 2.0,
			};

			vi.mocked(queryDao.executeQuery).mockResolvedValue(mockResult);

			const res = await app.request("/pg/query?database=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: "  \t  SELECT   1   as   id  \t  ",
				}),
			});

			expect(res.status).toBe(200);
		});
	});
});
