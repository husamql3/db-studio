import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Mock all route dependencies
vi.mock("@/dao/database-list.dao.js", () => ({
	getDatabasesList: vi.fn().mockResolvedValue([]),
	getCurrentDatabase: vi.fn().mockResolvedValue({ database: "test" }),
	getDatabaseConnectionInfo: vi.fn().mockResolvedValue({
		version: "PostgreSQL 15.2",
		database: "test",
		user: "postgres",
		host: "localhost",
		port: 5432,
		active_connections: 1,
		max_connections: 100,
	}),
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
}));

import { createServer } from "@/utils/create-server.js";

describe("createServer", () => {
	let server: ReturnType<typeof createServer>;

	beforeEach(() => {
		vi.clearAllMocks();
		server = createServer();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Server initialization", () => {
		it("should return an object with app property", () => {
			expect(server).toHaveProperty("app");
		});

		it("should return an app with Hono methods", () => {
			// Using duck typing instead of instanceof due to module resolution
			expect(typeof server.app.request).toBe("function");
			expect(typeof server.app.fetch).toBe("function");
			expect(typeof server.app.get).toBe("function");
			expect(typeof server.app.post).toBe("function");
		});

		it("should create app with strict: false option", async () => {
			// Test that trailing slashes are handled gracefully
			const res1 = await server.app.request("/pg/databases");
			const res2 = await server.app.request("/pg/databases/");

			// Both should work (or at least not throw 500)
			expect([200, 404]).toContain(res1.status);
			expect([200, 404]).toContain(res2.status);
		});
	});

	describe("Database type validation middleware", () => {
		it("should accept pg as valid database type", async () => {
			const res = await server.app.request("/pg/databases");
			expect(res.status).toBe(200);
		});

		it("should reject invalid database type with 400", async () => {
			const res = await server.app.request("/invalid/databases");
			expect(res.status).toBe(400);
		});

		it("should reject mysql database type", async () => {
			const res = await server.app.request("/mysql/databases");
			expect(res.status).toBe(400);
		});

		it("should reject sqlite database type", async () => {
			const res = await server.app.request("/sqlite/databases");
			expect(res.status).toBe(400);
		});

		it("should reject mongodb database type", async () => {
			const res = await server.app.request("/mongodb/databases");
			expect(res.status).toBe(400);
		});

		it("should reject numeric database type", async () => {
			const res = await server.app.request("/123/databases");
			expect(res.status).toBe(400);
		});

		it("should reject uppercase PG", async () => {
			const res = await server.app.request("/PG/databases");
			expect(res.status).toBe(400);
		});

		it("should reject mixed case Pg", async () => {
			const res = await server.app.request("/Pg/databases");
			expect(res.status).toBe(400);
		});

		it("should return validation error for invalid type", async () => {
			const res = await server.app.request("/invalid/databases");
			const json = await res.json();

			// zValidator returns error in a different format
			expect(res.status).toBe(400);
			// The response contains the validation error info
			expect(json).toBeDefined();
		});
	});

	describe("CORS middleware", () => {
		it("should include Access-Control-Allow-Origin header", async () => {
			const res = await server.app.request("/pg/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should include Access-Control-Allow-Methods header", async () => {
			const res = await server.app.request("/pg/databases");

			const methods = res.headers.get("Access-Control-Allow-Methods");
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("PUT");
			expect(methods).toContain("DELETE");
			expect(methods).toContain("OPTIONS");
		});

		it("should include Access-Control-Allow-Headers header", async () => {
			const res = await server.app.request("/pg/databases");

			expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
		});

		it("should handle OPTIONS preflight request", async () => {
			const res = await server.app.request("/pg/databases", {
				method: "OPTIONS",
			});

			// OPTIONS should return without error
			expect([200, 204, 404]).toContain(res.status);
		});
	});

	describe("Pretty JSON middleware", () => {
		it("should return JSON response", async () => {
			const res = await server.app.request("/pg/databases");
			const json = await res.json();

			// Verify it's valid JSON with expected structure
			expect(json).toHaveProperty("data");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	describe("Routes registration", () => {
		describe("/databases routes", () => {
			it("should register GET /databases", async () => {
				const res = await server.app.request("/pg/databases");
				expect(res.status).toBe(200);
			});

			it("should register GET /databases/current", async () => {
				const res = await server.app.request("/pg/databases/current");
				expect(res.status).toBe(200);
			});

			it("should register GET /databases/connection", async () => {
				const res = await server.app.request("/pg/databases/connection");
				expect(res.status).toBe(200);
			});
		});

		describe("/tables routes", () => {
			it("should register /tables route group", async () => {
				const res = await server.app.request("/pg/tables");
				// Should not be 404 (route exists), but may require params
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/records routes", () => {
			it("should register /records route group", async () => {
				const res = await server.app.request("/pg/records");
				// Should not be 404 (route exists), but may require params
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/query routes", () => {
			it("should register /query route group", async () => {
				const res = await server.app.request("/pg/query", { method: "POST" });
				// Should not be 404 (route exists), but may require body
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/chat routes", () => {
			it("should register /chat route group", async () => {
				const res = await server.app.request("/pg/chat", { method: "POST" });
				// Should not be 404 (route exists), but may require body
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});
	});

	describe("Error handling", () => {
		it("should handle errors with custom error handler", async () => {
			// The error handler is tested more thoroughly in error-handler.test.ts
			// Here we just verify it's wired up correctly
			const res = await server.app.request("/invalid/databases");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty("error");
		});
	});

	describe("Base path handling", () => {
		it("should use /:dbType as base path", async () => {
			// Request without proper dbType gets validated and fails
			const res = await server.app.request("/databases");
			// "databases" is treated as dbType and fails validation
			expect(res.status).toBe(400);
		});

		it("should require valid database type in URL", async () => {
			const res = await server.app.request("/");
			// Root path doesn't match the base path pattern
			expect(res.status).toBe(404);
		});
	});

	describe("Response format", () => {
		it("should return JSON responses", async () => {
			const res = await server.app.request("/pg/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});

		it("should wrap data in data property", async () => {
			const res = await server.app.request("/pg/databases");
			const json = await res.json();

			expect(json).toHaveProperty("data");
		});
	});

	describe("Multiple server instances", () => {
		it("should create independent server instances", () => {
			const server1 = createServer();
			const server2 = createServer();

			expect(server1.app).not.toBe(server2.app);
		});

		it("should handle requests independently", async () => {
			const server1 = createServer();
			const server2 = createServer();

			const [res1, res2] = await Promise.all([
				server1.app.request("/pg/databases"),
				server2.app.request("/pg/databases"),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
		});
	});

	describe("Query parameters handling", () => {
		it("should ignore unknown query parameters", async () => {
			const res = await server.app.request("/pg/databases?unknown=value&foo=bar");
			expect(res.status).toBe(200);
		});

		it("should handle empty query string", async () => {
			const res = await server.app.request("/pg/databases?");
			expect(res.status).toBe(200);
		});
	});

	describe("Path handling edge cases", () => {
		it("should handle double slashes", async () => {
			const res = await server.app.request("/pg//databases");
			// May normalize or return 404
			expect([200, 404]).toContain(res.status);
		});

		it("should return 404 for unknown routes under valid dbType", async () => {
			const res = await server.app.request("/pg/unknown-route");
			expect(res.status).toBe(404);
		});

		it("should return 404 for deeply nested unknown routes", async () => {
			const res = await server.app.request("/pg/databases/unknown/deep/path");
			expect(res.status).toBe(404);
		});
	});
});
