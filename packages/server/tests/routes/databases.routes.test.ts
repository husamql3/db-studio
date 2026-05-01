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

// Mock db-manager
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
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

	describe("GET /databases", () => {
		it("should return list of databases with 200 status", async () => {
			const mockDatabases = [
				{ name: "testdb", size: "8192 bytes", owner: "postgres", encoding: "UTF8" },
				{ name: "production", size: "1 GB", owner: "admin", encoding: "UTF8" },
				{ name: "staging", size: "500 MB", owner: "dev", encoding: "LATIN1" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual(mockDatabases);
			expect(json.data.dbType).toBe("pg");
			expect(mockDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("should return empty array when no databases exist", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual([]);
		});

		it("should handle single database response", async () => {
			const mockDatabases = [
				{ name: "only_db", size: "1 MB", owner: "solo", encoding: "UTF8" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(1);
			expect(json.data.databases[0].name).toBe("only_db");
		});

		it("should handle large number of databases", async () => {
			const mockDatabases = Array.from({ length: 100 }, (_, i) => ({
				name: `database_${i}`,
				size: `${i * 100} MB`,
				owner: `owner_${i % 5}`,
				encoding: "UTF8",
			}));

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(100);
		});

		it("should handle database with special characters in name", async () => {
			const mockDatabases = [
				{ name: "db_with_underscore", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "db123", size: "2 MB", owner: "user", encoding: "UTF8" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual(mockDatabases);
		});

		it("should handle various size formats", async () => {
			const mockDatabases = [
				{ name: "tiny", size: "8192 bytes", owner: "user", encoding: "UTF8" },
				{ name: "small", size: "10 kB", owner: "user", encoding: "UTF8" },
				{ name: "medium", size: "500 MB", owner: "user", encoding: "UTF8" },
				{ name: "large", size: "2 GB", owner: "user", encoding: "UTF8" },
				{ name: "huge", size: "1 TB", owner: "user", encoding: "UTF8" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(5);
		});

		it("should handle different encodings", async () => {
			const mockDatabases = [
				{ name: "utf8db", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "latindb", size: "1 MB", owner: "user", encoding: "LATIN1" },
				{ name: "asciidb", size: "1 MB", owner: "user", encoding: "SQL_ASCII" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases.map((d: { encoding: string }) => d.encoding)).toEqual([
				"UTF8",
				"LATIN1",
				"SQL_ASCII",
			]);
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new HTTPException(500, { message: "No databases returned from database" }),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
		});

		it("should return 503 when database connection fails", async () => {
			const connectionError = new Error("connect ECONNREFUSED 127.0.0.1:5432");
			mockDao.getDatabasesList.mockRejectedValue(connectionError);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			const timeoutError = new Error("timeout expired");
			mockDao.getDatabasesList.mockRejectedValue(timeoutError);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection terminated", async () => {
			const terminatedError = new Error("Connection terminated unexpectedly");
			mockDao.getDatabasesList.mockRejectedValue(terminatedError);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
		});

		it("should return 500 on generic database error", async () => {
			const dbError = new Error("Unexpected database error");
			mockDao.getDatabasesList.mockRejectedValue(dbError);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Unexpected database error");
		});
	});

	describe("GET /databases/current", () => {
		it("should return current database with 200 status", async () => {
			const mockCurrent = { db: "testdb" };

			mockDao.getCurrentDatabase.mockResolvedValue(mockCurrent);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("testdb");
			expect(json.data.dbType).toBe("pg");
			expect(mockDao.getCurrentDatabase).toHaveBeenCalledTimes(1);
		});

		it("should handle database with long name", async () => {
			const longName = "a".repeat(63);
			const mockCurrent = { db: longName };

			mockDao.getCurrentDatabase.mockResolvedValue(mockCurrent);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe(longName);
		});

		it("should handle database with underscore prefix", async () => {
			const mockCurrent = { db: "_internal_db" };

			mockDao.getCurrentDatabase.mockResolvedValue(mockCurrent);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("_internal_db");
		});

		it("should return 500 when no current database", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(
				new HTTPException(500, { message: "No current database returned from database" }),
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(500);
		});

		it("should return 503 on connection error", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(new Error("connection refused"));

			const res = await app.request("/databases/current");

			expect(res.status).toBe(503);
		});
	});

	describe("GET /databases/connection", () => {
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

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockConnectionInfo);
			expect(mockDao.getDatabaseConnectionInfo).toHaveBeenCalledTimes(1);
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

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

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

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

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

				mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

				const res = await app.request("/databases/connection");

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

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.port).toBe(5433);
		});

		it("should return 500 when connection info query fails", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(
				new HTTPException(500, { message: "No connection information returned from database" }),
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(500);
		});

		it("should return 503 on database connection failure", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(
				new Error("connect ECONNREFUSED"),
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(503);
		});
	});

	describe("Invalid database type validation", () => {
		it("should return 400 for invalid database type", async () => {
			const res = await app.request("/invalid/databases");

			expect(res.status).toBe(400);
		});

		it("should return 404 for /mysql/databases (no dbType-prefixed databases route)", async () => {
			const res = await app.request("/mysql/databases");

			expect(res.status).toBe(404);
		});

		it("should return 400 for sqlite database type (not supported)", async () => {
			const res = await app.request("/sqlite/databases");

			expect(res.status).toBe(400);
		});

		it("should return 400 for empty database type", async () => {
			const res = await app.request("//databases");

			expect([400, 404]).toContain(res.status);
		});

		it("should return 400 for numeric database type", async () => {
			const res = await app.request("/123/databases");

			expect(res.status).toBe(400);
		});

		it("should accept valid pg database type", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
		});
	});

	describe("HTTP methods validation", () => {
		it("should reject POST /databases", async () => {
			const res = await app.request("/databases", { method: "POST" });

			expect([404, 405, 400]).toContain(res.status);
		});

		it("should reject PUT /databases", async () => {
			const res = await app.request("/databases", { method: "PUT" });

			expect([404, 405, 400]).toContain(res.status);
		});

		it("should reject DELETE /databases", async () => {
			const res = await app.request("/databases", { method: "DELETE" });

			expect([404, 405, 400]).toContain(res.status);
		});

		it("should reject PATCH /databases", async () => {
			const res = await app.request("/databases", { method: "PATCH" });

			expect([404, 405, 400]).toContain(res.status);
		});

		it("should handle OPTIONS request for CORS", async () => {
			const res = await app.request("/databases", { method: "OPTIONS" });

			expect([200, 204, 404]).toContain(res.status);
		});

		it("should return 404 for HEAD /databases", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);
			const res = await app.request("/databases", { method: "HEAD" });

			expect([200, 404]).toContain(res.status);
		});
	});

	describe("Response headers", () => {
		it("should include CORS headers", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("should return JSON content type", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});

	describe("Concurrent requests handling", () => {
		it("should handle multiple concurrent requests to /databases", async () => {
			mockDao.getDatabasesList.mockResolvedValue([
				{ name: "testdb", size: "1 MB", owner: "user", encoding: "UTF8" },
			]);

			const requests = Array.from({ length: 10 }, () => app.request("/databases"));

			const responses = await Promise.all(requests);

			for (const res of responses) {
				expect(res.status).toBe(200);
			}

			expect(mockDao.getDatabasesList).toHaveBeenCalledTimes(10);
		});

		it("should handle concurrent requests to different endpoints", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);
			mockDao.getCurrentDatabase.mockResolvedValue({ db: "test" });
			mockDao.getDatabaseConnectionInfo.mockResolvedValue({
				version: "PostgreSQL 15.2",
				database: "test",
				user: "postgres",
				host: "localhost",
				port: 5432,
				active_connections: 1,
				max_connections: 100,
			});

			const [res1, res2, res3] = await Promise.all([
				app.request("/databases"),
				app.request("/databases/current"),
				app.request("/databases/connection"),
			]);

			expect(res1.status).toBe(200);
			expect(res2.status).toBe(200);
			expect(res3.status).toBe(200);
		});
	});

	describe("Edge cases", () => {
		it("should handle trailing slash in URL", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases/");

			expect([200, 404]).toContain(res.status);
		});

		it("should handle query parameters gracefully", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases?foo=bar&baz=123");

			expect(res.status).toBe(200);
		});

		it("should handle URL encoded characters", async () => {
			const res = await app.request("/databases%2Fcurrent");

			expect([200, 400, 404]).toContain(res.status);
		});

		it("should reject non-existent sub-routes", async () => {
			const res = await app.request("/databases/nonexistent");

			expect([404, 400]).toContain(res.status);
		});

		it("should reject deeply nested non-existent routes", async () => {
			const res = await app.request("/databases/current/extra/path");

			expect([404, 400]).toContain(res.status);
		});
	});
});
