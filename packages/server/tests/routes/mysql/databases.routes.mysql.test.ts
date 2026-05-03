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
	getDbType: vi.fn(() => "mysql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Databases Routes (MySQL)", () => {
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
	// GET /databases
	// ============================================
	describe("GET /databases", () => {
		it("should return list of MySQL databases with 200 status", async () => {
			const mockDatabases = [
				{ name: "mydb", size: "128 MB" },
				{ name: "testdb", size: "64 MB" },
				{ name: "production", size: "2 GB" },
			];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual(mockDatabases);
			expect(json.data.dbType).toBe("mysql");
			expect(mockDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("should return empty array when no databases exist", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual([]);
			expect(json.data.dbType).toBe("mysql");
		});

		it("should handle single database response", async () => {
			const mockDatabases = [{ name: "only_db", size: "1 MB" }];

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(1);
			expect(json.data.databases[0].name).toBe("only_db");
		});

		it("should handle large number of databases", async () => {
			const mockDatabases = Array.from({ length: 50 }, (_, i) => ({
				name: `database_${i}`,
				size: `${i * 100} MB`,
			}));

			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(50);
		});

		it("should include dbType as mysql in response", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.dbType).toBe("mysql");
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new HTTPException(500, { message: "Failed to list databases" })
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
		});

		it("should return 503 when MySQL connection fails", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:3306")
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("should return 503 on connection timeout", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("timeout expired")
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
		});

		it("should return 500 on generic database error", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("Unexpected database error")
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Unexpected database error");
		});
	});

	// ============================================
	// GET /databases/current
	// ============================================
	describe("GET /databases/current", () => {
		it("should return current MySQL database with 200 status", async () => {
			const mockCurrent = { db: "mydb" };

			mockDao.getCurrentDatabase.mockResolvedValue(mockCurrent);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("mydb");
			expect(json.data.dbType).toBe("mysql");
			expect(mockDao.getCurrentDatabase).toHaveBeenCalledTimes(1);
		});

		it("should handle database with underscore in name", async () => {
			const mockCurrent = { db: "my_production_db" };

			mockDao.getCurrentDatabase.mockResolvedValue(mockCurrent);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("my_production_db");
		});

		it("should include dbType as mysql in current response", async () => {
			mockDao.getCurrentDatabase.mockResolvedValue({ db: "testdb" });

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.dbType).toBe("mysql");
		});

		it("should return 500 when DAO throws HTTPException", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(
				new HTTPException(500, { message: "No current database returned" })
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(500);
		});

		it("should return 503 on connection error", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(
				new Error("connection refused")
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /databases/connection
	// ============================================
	describe("GET /databases/connection", () => {
		it("should return MySQL connection info with 200 status", async () => {
			const mockConnectionInfo = {
				version: "8.0.33",
				database: "mydb",
				user: "root",
				host: "localhost",
				port: 3306,
				active_connections: 3,
				max_connections: 151,
			};

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockConnectionInfo);
			expect(mockDao.getDatabaseConnectionInfo).toHaveBeenCalledTimes(1);
		});

		it("should handle different MySQL versions", async () => {
			const versions = ["8.0.30", "8.0.33", "8.1.0", "5.7.42"];

			for (const version of versions) {
				const mockConnectionInfo = {
					version,
					database: "testdb",
					user: "root",
					host: "localhost",
					port: 3306,
					active_connections: 1,
					max_connections: 151,
				};

				mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

				const res = await app.request("/databases/connection");

				expect(res.status).toBe(200);
				const json = await res.json();
				expect(json.data.version).toBe(version);
			}
		});

		it("should handle high connection count", async () => {
			const mockConnectionInfo = {
				version: "8.0.33",
				database: "production",
				user: "admin",
				host: "prod-db.example.com",
				port: 3306,
				active_connections: 148,
				max_connections: 151,
			};

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.active_connections).toBe(148);
			expect(json.data.max_connections).toBe(151);
		});

		it("should handle default MySQL port 3306", async () => {
			const mockConnectionInfo = {
				version: "8.0.33",
				database: "testdb",
				user: "root",
				host: "localhost",
				port: 3306,
				active_connections: 1,
				max_connections: 151,
			};

			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockConnectionInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.port).toBe(3306);
		});

		it("should return 500 when connection info query fails", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(
				new HTTPException(500, { message: "Failed to get connection info" })
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(500);
		});

		it("should return 503 on database connection failure", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(
				new Error("connect ECONNREFUSED")
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// Response headers
	// ============================================
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
});
