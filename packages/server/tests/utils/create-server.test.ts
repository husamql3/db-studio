import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

	describe("Database type validation middleware", () => {
		it("should reject an unsupported database type with a 400 error payload", async () => {
			const res = await server.app.request("/api/invalid/databases");
			const json = await res.json();

			expect(res.status).toBe(400);
			expect(json).toHaveProperty("error");
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
			expect(methods).toContain("PATCH");
			expect(methods).toContain("DELETE");
			expect(methods).toContain("OPTIONS");
		});

		it("should advertise allowed headers on a CORS preflight", async () => {
			const res = await server.app.request("/api/chat", {
				method: "OPTIONS",
				headers: {
					Origin: "https://web.db-studio.localhost",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "content-type,x-run-id,x-byok-anthropic",
				},
			});

			const headers = res.headers.get("Access-Control-Allow-Headers");
			expect(headers).toContain("Content-Type");
			expect(headers?.toLowerCase()).toContain("x-run-id");
			expect(headers?.toLowerCase()).toContain("x-byok-anthropic");
		});

		it("should allow localhost and *.localhost origins when NODE_ENV is development", async () => {
			const originalEnv = process.env.NODE_ENV;
			const originalOrigins = process.env.ALLOWED_ORIGINS;
			try {
				process.env.NODE_ENV = "development";
				delete process.env.ALLOWED_ORIGINS;
				const res1 = await server.app.request("/api/databases", {
					headers: { Origin: "https://web.db-studio.localhost" },
				});
				expect(res1.headers.get("Access-Control-Allow-Origin")).toBe(
					"https://web.db-studio.localhost",
				);

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
				if (originalEnv === undefined) {
					delete process.env.NODE_ENV;
				} else {
					process.env.NODE_ENV = originalEnv;
				}
				if (originalOrigins === undefined) {
					delete process.env.ALLOWED_ORIGINS;
				} else {
					process.env.ALLOWED_ORIGINS = originalOrigins;
				}
			}
		});

		it("should allow origins configured in ALLOWED_ORIGINS", async () => {
			const originalOrigins = process.env.ALLOWED_ORIGINS;
			try {
				process.env.ALLOWED_ORIGINS = "https://custom.dbstudio.sh, https://admin.dbstudio.sh";
				const res = await server.app.request("/api/databases", {
					headers: { Origin: "https://custom.dbstudio.sh" },
				});
				expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
					"https://custom.dbstudio.sh",
				);
			} finally {
				if (originalOrigins === undefined) {
					delete process.env.ALLOWED_ORIGINS;
				} else {
					process.env.ALLOWED_ORIGINS = originalOrigins;
				}
			}
		});
	});
});
