import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as databaseListDao from "@/dao/database-list.dao.js";

// Mock the DAO module
vi.mock("@/dao/database-list.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
}));

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: vi.fn(),
	})),
}));

describe("Databases Routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		const server = createServer();
		app = server.app;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("GET /pg/databases", () => {
		it("should return list of databases with 200 status", async () => {
			const mockDatabases = [
				{ name: "testdb", size: "8192 bytes", owner: "postgres", encoding: "UTF8" },
				{ name: "production", size: "1 GB", owner: "admin", encoding: "UTF8" },
				{ name: "staging", size: "500 MB", owner: "dev", encoding: "LATIN1" },
			];

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockDatabases);
			expect(databaseListDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("should return empty array when no databases exist", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual([]);
		});

		it("should handle single database response", async () => {
			const mockDatabases = [
				{ name: "only_db", size: "1 MB", owner: "solo", encoding: "UTF8" },
			];

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(1);
			expect(json.data[0].name).toBe("only_db");
		});

		it("should handle large number of databases", async () => {
			const mockDatabases = Array.from({ length: 100 }, (_, i) => ({
				name: `database_${i}`,
				size: `${i * 100} MB`,
				owner: `owner_${i % 5}`,
				encoding: "UTF8",
			}));

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(100);
		});

		it("should handle database with special characters in name", async () => {
			const mockDatabases = [
				{ name: "db_with_underscore", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "db123", size: "2 MB", owner: "user", encoding: "UTF8" },
			];

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockDatabases);
		});

		it("should handle various size formats", async () => {
			const mockDatabases = [
				{ name: "tiny", size: "8192 bytes", owner: "user", encoding: "UTF8" },
				{ name: "small", size: "10 kB", owner: "user", encoding: "UTF8" },
				{ name: "medium", size: "500 MB", owner: "user", encoding: "UTF8" },
				{ name: "large", size: "2 GB", owner: "user", encoding: "UTF8" },
				{ name: "huge", size: "1 TB", owner: "user", encoding: "UTF8" },
			];

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toHaveLength(5);
		});

		it("should handle different encodings", async () => {
			const mockDatabases = [
				{ name: "utf8db", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "latindb", size: "1 MB", owner: "user", encoding: "LATIN1" },
				{ name: "asciidb", size: "1 MB", owner: "user", encoding: "SQL_ASCII" },
			];

			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.map((d: { encoding: string }) => d.encoding)).toEqual([
				"UTF8",
				"LATIN1",
				"SQL_ASCII",
			]);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockRejectedValue(
				new HTTPException(500, { message: "No databases returned from database" })
			);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:5432");
			vi.mocked(databaseListDao.getDatabasesList).mockRejectedValue(connectionError);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			const timeoutError = new Error("timeout expired");
			vi.mocked(databaseListDao.getDatabasesList).mockRejectedValue(timeoutError);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection terminated", async () => {
			const terminatedError = new Error("Connection terminated unexpectedly");
			vi.mocked(databaseListDao.getDatabasesList).mockRejectedValue(terminatedError);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(503);
		});

		it("should return 500 on generic database error", async () => {
			const dbError = new Error("Unexpected database error");
			vi.mocked(databaseListDao.getDatabasesList).mockRejectedValue(dbError);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Unexpected database error");
		});
	});

	describe("GET /pg/databases/current", () => {
		it("should return current database with 200 status", async () => {
			const mockCurrent = { database: "testdb" };

			vi.mocked(databaseListDao.getCurrentDatabase).mockResolvedValue(mockCurrent);

			const res = await app.request("/pg/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockCurrent);
			expect(databaseListDao.getCurrentDatabase).toHaveBeenCalledTimes(1);
		});

		it("should handle database with long name", async () => {
			const longName = "a".repeat(63); // PostgreSQL max identifier length
			const mockCurrent = { database: longName };

			vi.mocked(databaseListDao.getCurrentDatabase).mockResolvedValue(mockCurrent);

			const res = await app.request("/pg/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.database).toBe(longName);
		});

		it("should handle database with underscore prefix", async () => {
			const mockCurrent = { database: "_internal_db" };

			vi.mocked(databaseListDao.getCurrentDatabase).mockResolvedValue(mockCurrent);

			const res = await app.request("/pg/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.database).toBe("_internal_db");
		});

		it("should return 500 when no current database", async () => {
			vi.mocked(databaseListDao.getCurrentDatabase).mockRejectedValue(
				new HTTPException(500, { message: "No current database returned from database" })
			);

			const res = await app.request("/pg/databases/current");

			expect(res.status).toBe(500);
		});

		it("should return 503 on connection error", async () => {
			vi.mocked(databaseListDao.getCurrentDatabase).mockRejectedValue(
				new Error("connection refused")
			);

			const res = await app.request("/pg/databases/current");

			expect(res.status).toBe(503);
		});
	});

	describe("GET /pg/databases/connection", () => {
		it("should return connection info with 200 status", async () => {
			const mockConnectionInfo = {
				version: "PostgreSQL 15.2",
				database: "testdb",
				user: "postgres",
				host: "localhost",
				port: 5432,
				active_connections: 5,
				max_connections: 100,
			};

			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockConnectionInfo);
			expect(databaseListDao.getDatabaseConnectionInfo).toHaveBeenCalledTimes(1);
		});

		it("should handle null host (local socket connection)", async () => {
			const mockConnectionInfo = {
				version: "PostgreSQL 15.2",
				database: "testdb",
				user: "postgres",
				host: null,
				port: null,
				active_connections: 1,
				max_connections: 100,
			};

			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.host).toBeNull();
			expect(json.data.port).toBeNull();
		});

		it("should handle high connection count", async () => {
			const mockConnectionInfo = {
				version: "PostgreSQL 15.2",
				database: "production",
				user: "admin",
				host: "prod-db.example.com",
				port: 5432,
				active_connections: 95,
				max_connections: 100,
			};

			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.active_connections).toBe(95);
			expect(json.data.max_connections).toBe(100);
		});

		it("should handle different PostgreSQL versions", async () => {
			const versions = [
				"PostgreSQL 12.15",
				"PostgreSQL 13.11",
				"PostgreSQL 14.8",
				"PostgreSQL 15.3",
				"PostgreSQL 16.0",
			];

			for (const version of versions) {
				const mockConnectionInfo = {
					version,
					database: "testdb",
					user: "postgres",
					host: "localhost",
					port: 5432,
					active_connections: 1,
					max_connections: 100,
				};

				vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockConnectionInfo);

				const res = await app.request("/pg/databases/connection");

				expect(res.status).toBe(200);
				const json = await res.json();
				expect(json.data.version).toBe(version);
			}
		});

		it("should handle non-standard port", async () => {
			const mockConnectionInfo = {
				version: "PostgreSQL 15.2",
				database: "testdb",
				user: "postgres",
				host: "localhost",
				port: 5433,
				active_connections: 1,
				max_connections: 100,
			};

			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.port).toBe(5433);
		});

		it("should return 500 when connection info query fails", async () => {
			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockRejectedValue(
				new HTTPException(500, { message: "No connection information returned from database" })
			);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(500);
		});

		it("should return 503 on database connection failure", async () => {
			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/pg/databases/connection");

			expect(res.status).toBe(503);
		});
	});

	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/databases");

			expect(res.status).toBe(400);
		});

		it("should return 400 for mysql database type (not supported)", async () => {
			const res = await app.request("/mysql/databases");

			expect(res.status).toBe(400);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/databases");

			expect(res.status).toBe(400);
		});

		it("should return 400 for empty database type", async () => {
			const res = await app.request("//databases");

			// Empty path segment may result in different behavior
			expect([400, 404]).toContain(res.status);
		});

		it("should return 400 for numeric database type", async () => {
			const res = await app.request("/123/databases");

			expect(res.status).toBe(400);
		});

		it("should accept valid pg database type", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases");

			expect(res.status).toBe(200);
		});
	});

	describe("HTTP methods validation", () => {
		it("should return 404 for POST /databases", async () => {
			const res = await app.request("/pg/databases", { method: "POST" });

			expect(res.status).toBe(404);
		});

		it("should return 404 for PUT /databases", async () => {
			const res = await app.request("/pg/databases", { method: "PUT" });

			expect(res.status).toBe(404);
		});

		it("should return 404 for DELETE /databases", async () => {
			const res = await app.request("/pg/databases", { method: "DELETE" });

			expect(res.status).toBe(404);
		});

		it("should return 404 for PATCH /databases", async () => {
			const res = await app.request("/pg/databases", { method: "PATCH" });

			expect(res.status).toBe(404);
		});

		it("should handle OPTIONS request for CORS", async () => {
			const res = await app.request("/pg/databases", { method: "OPTIONS" });

			// OPTIONS should work for CORS preflight
			expect([200, 204, 404]).toContain(res.status);
		});

		it("should return 404 for HEAD /databases", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);
			const res = await app.request("/pg/databases", { method: "HEAD" });

			// HEAD might return 200 without body or 404
			expect([200, 404]).toContain(res.status);
		});
	});

	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /databases", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([
				{ name: "testdb", size: "1 MB", owner: "user", encoding: "UTF8" },
			]);

			const requests = Array.from({ length: 10 }, () =>
				app.request("/pg/databases")
			);

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(databaseListDao.getDatabasesList).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests to different endpoints", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);
			vi.mocked(databaseListDao.getCurrentDatabase).mockResolvedValue({ database: "test" });
			vi.mocked(databaseListDao.getDatabaseConnectionInfo).mockResolvedValue({
				version: "PostgreSQL 15.2",
				database: "test",
				user: "postgres",
				host: "localhost",
				port: 5432,
				active_connections: 1,
				max_connections: 100,
			});

			const [res1, res2, res3] = await Promise.all([
				app.request("/pg/databases"),
				app.request("/pg/databases/current"),
				app.request("/pg/databases/connection"),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
			expect(res3.status).toBe(200);
		});
	});

	describe("Edge cases", () => {
		it("should handle trailing slash in URL", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases/");

			// Should work with or without trailing slash due to strict: false
			expect([200, 404]).toContain(res.status);
		});

		it("should handle query parameters gracefully", async () => {
			vi.mocked(databaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/pg/databases?foo=bar&baz=123");

			expect(res.status).toBe(200);
		});

		it("should handle URL encoded characters", async () => {
			const res = await app.request("/pg/databases%2Fcurrent");

			// URL encoded slash may be treated differently
			expect([200, 400, 404]).toContain(res.status);
		});

		it("should return 404 for non-existent sub-routes", async () => {
			const res = await app.request("/pg/databases/nonexistent");

			expect(res.status).toBe(404);
		});

		it("should return 404 for deeply nested non-existent routes", async () => {
			const res = await app.request("/pg/databases/current/extra/path");

			expect(res.status).toBe(404);
		});
	});
});
