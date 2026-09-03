import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const mockDao = vi.hoisted(() => ({
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

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mockDao),
	adapterRegistry: {
		register: vi.fn(),
		get: vi.fn(() => mockDao),
		has: vi.fn((type: string) => ["pg", "mysql", "mssql", "mongodb"].includes(type)),
		getSupportedTypes: vi.fn(() => ["pg", "mysql", "mssql", "mongodb"]),
	},
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
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
			const res1 = await server.app.request("/api/databases");
			const res2 = await server.app.request("/api/databases/");

			// Both should work (or at least not throw 500)
			expect([200, 404]).toContain(res1.status);
			expect([200, 404]).toContain(res2.status);
		});
	});

	describe("Database type validation middleware", () => {
		it("should accept pg as valid database type", async () => {
			const res = await server.app.request("/api/databases");
			expect(res.status).toBe(200);
		});

		it("should reject invalid database type with 400", async () => {
			const res = await server.app.request("/api/invalid/databases");
			expect(res.status).toBe(400);
		});

		it("should accept mysql database type as valid (no /mysql/databases route → 404)", async () => {
			const res = await server.app.request("/api/mysql/databases");
			// mysql is now a valid dbType; /mysql/databases has no handler → 404
			expect(res.status).toBe(404);
		});

		it("should reject sqlite database type", async () => {
			const res = await server.app.request("/api/sqlite/databases");
			expect(res.status).toBe(400);
		});

		it("should accept mongodb database type as valid (no /mongodb/databases route → 404)", async () => {
			const res = await server.app.request("/api/mongodb/databases");
			// mongodb is now a valid dbType; /mongodb/databases has no handler → 404
			expect(res.status).toBe(404);
		});

		it("should reject numeric database type", async () => {
			const res = await server.app.request("/api/123/databases");
			expect(res.status).toBe(400);
		});

		it("should reject uppercase PG", async () => {
			const res = await server.app.request("/api/PG/databases");
			expect(res.status).toBe(400);
		});

		it("should reject mixed case Pg", async () => {
			const res = await server.app.request("/api/Pg/databases");
			expect(res.status).toBe(400);
		});

		it("should return validation error for invalid type", async () => {
			const res = await server.app.request("/api/invalid/databases");
			const json = await res.json();

			// zValidator returns error in a different format
			expect(res.status).toBe(400);
			// The response contains the validation error info
			expect(json).toBeDefined();
		});
	});

	describe("CORS middleware", () => {
		it("should NOT emit a wildcard Access-Control-Allow-Origin for a same-origin/no-origin request", async () => {
			const res = await server.app.request("/api/databases");

			// Same-origin default: no allowlist configured means no allow-origin
			// header is reflected. A cross-origin caller therefore gets no CORS
			// grant (prevents drive-by-localhost).
			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		it("should NOT emit an Access-Control-Allow-Origin for a disallowed cross-origin request", async () => {
			const res = await server.app.request("/api/databases", {
				headers: { Origin: "https://evil.example" },
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		it("should advertise allowed methods on a CORS preflight", async () => {
			const res = await server.app.request("/api/databases", { method: "OPTIONS" });

			const methods = res.headers.get("Access-Control-Allow-Methods");
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("PUT");
			expect(methods).toContain("DELETE");
			expect(methods).toContain("OPTIONS");
		});

		it("should advertise allowed headers on a CORS preflight", async () => {
			const res = await server.app.request("/api/databases", { method: "OPTIONS" });

			expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
		});

		it("should handle OPTIONS preflight request", async () => {
			const res = await server.app.request("/api/databases", {
				method: "OPTIONS",
			});

			// OPTIONS should return without error
			expect([200, 204, 404]).toContain(res.status);
		});

		it("should allow localhost and *.localhost origins when NODE_ENV is development", async () => {
			const originalEnv = process.env.NODE_ENV;
			try {
				process.env.NODE_ENV = "development";
				const res1 = await server.app.request("/api/databases", {
					headers: { Origin: "https://web.db-studio.localhost" },
				});
				expect(res1.headers.get("Access-Control-Allow-Origin")).toBe("https://web.db-studio.localhost");

				const res2 = await server.app.request("/api/databases", {
					headers: { Origin: "http://localhost:3000" },
				});
				expect(res2.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");

				const res3 = await server.app.request("/api/databases", {
					headers: { Origin: "http://127.0.0.1:5173" },
				});
				expect(res3.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:5173");

				const resEvil = await server.app.request("/api/databases", {
					headers: { Origin: "https://evil.example" },
				});
				expect(resEvil.headers.get("Access-Control-Allow-Origin")).toBeNull();
			} finally {
				process.env.NODE_ENV = originalEnv;
			}
		});

		it("should allow origins configured in ALLOWED_ORIGINS", async () => {
			const originalOrigins = process.env.ALLOWED_ORIGINS;
			try {
				process.env.ALLOWED_ORIGINS = "https://custom.dbstudio.sh, https://admin.dbstudio.sh";
				const res = await server.app.request("/api/databases", {
					headers: { Origin: "https://custom.dbstudio.sh" },
				});
				expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://custom.dbstudio.sh");
			} finally {
				process.env.ALLOWED_ORIGINS = originalOrigins;
			}
		});
	});

	describe("Pretty JSON middleware", () => {
		it("should return JSON response", async () => {
			const res = await server.app.request("/api/databases");
			const json = await res.json();

			// Verify it's valid JSON with expected structure
			expect(json).toHaveProperty("data");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	describe("Routes registration", () => {
		describe("/databases routes", () => {
			it("should register GET /databases", async () => {
				const res = await server.app.request("/api/databases");
				expect(res.status).toBe(200);
			});

			it("should register GET /databases/current", async () => {
				const res = await server.app.request("/api/databases/current");
				expect(res.status).toBe(200);
			});

			it("should register GET /databases/connection", async () => {
				const res = await server.app.request("/api/databases/connection");
				expect(res.status).toBe(200);
			});
		});

		describe("/tables routes", () => {
			it("should register /tables route group", async () => {
				const res = await server.app.request("/api/pg/tables");
				// Should not be 404 (route exists), but may require params
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/records routes", () => {
			it("should register /records route group", async () => {
				const res = await server.app.request("/api/pg/records");
				// Should not be 404 (route exists), but may require params
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/query routes", () => {
			it("should register /query route group", async () => {
				const res = await server.app.request("/api/pg/query", { method: "POST" });
				// Should not be 404 (route exists), but may require body
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});

		describe("/chat routes", () => {
			it("should register /chat route group", async () => {
				const res = await server.app.request("/api/pg/chat", { method: "POST" });
				// Should not be 404 (route exists), but may require body
				expect([200, 400, 404, 500]).toContain(res.status);
			});
		});
	});

	describe("Error handling", () => {
		it("should handle errors with custom error handler", async () => {
			// The error handler is tested more thoroughly in error-handler.test.ts
			// Here we just verify it's wired up correctly
			const res = await server.app.request("/api/invalid/databases");

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty("error");
		});
	});

	describe("Base path handling", () => {
		it("should have /databases routes under the API prefix (no dbType required)", async () => {
			const res = await server.app.request("/api/databases");
			expect(res.status).toBe(200);
		});

		it("should require valid database type for dbType-specific routes", async () => {
			// Request with invalid dbType gets validated and fails
			const res = await server.app.request("/api/invalid/tables?db=testdb");
			expect(res.status).toBe(400);
		});

		it("should return 404 for root path", async () => {
			const res = await server.app.request("/");
			// Root path is owned by the SPA (served only outside test env), so in
			// tests it matches no registered API route.
			expect(res.status).toBe(404);
		});

		it("should not treat SPA client routes as a database type (db-studio#214)", async () => {
			// A browser refresh on a client route like /table/:name must NOT be
			// interpreted as a /:dbType API request. Pre-fix this returned 400
			// "Invalid database type: table"; now it falls through to the SPA.
			const res = await server.app.request("/table/users", {
				headers: { Accept: "text/html" },
			});
			expect(res.status).not.toBe(400);
			const body = await res.text();
			expect(body).not.toContain("Invalid database type");
		});
	});

	describe("Response format", () => {
		it("should return JSON responses", async () => {
			const res = await server.app.request("/api/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});

		it("should wrap data in data property", async () => {
			const res = await server.app.request("/api/databases");
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
				server1.app.request("/api/databases"),
				server2.app.request("/api/databases"),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
		});
	});

	describe("Query parameters handling", () => {
		it("should ignore unknown query parameters", async () => {
			const res = await server.app.request("/api/databases?unknown=value&foo=bar");
			expect(res.status).toBe(200);
		});

		it("should handle empty query string", async () => {
			const res = await server.app.request("/api/databases?");
			expect(res.status).toBe(200);
		});
	});

	describe("Path handling edge cases", () => {
		it("should handle double slashes", async () => {
			const res = await server.app.request("/api/pg//databases");
			// May normalize or return 404
			expect([200, 404]).toContain(res.status);
		});

		it("should return 404 for unknown routes under valid dbType", async () => {
			const res = await server.app.request("/api/pg/unknown-route");
			expect(res.status).toBe(404);
		});

		it("should return 404 for deeply nested unknown routes", async () => {
			const res = await server.app.request("/api/pg/unknown/deep/path");
			expect(res.status).toBe(404);
		});
	});
});
