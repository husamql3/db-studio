import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mongoDatabaseListDao from "@/dao/mongo/database-list.mongo.dao.js";

vi.mock("@/dao/mongo/database-list.mongo.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getMongoDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getMongoCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
	getMongoConnectionInfo: vi.fn(),
}));

// Stub out other DB DAOs to prevent import-time failures
vi.mock("@/dao/database-list.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
}));

vi.mock("@/dao/mysql/database-list.mysql.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
}));

vi.mock("@/dao/mssql/database-list.mssql.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
}));

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMssqlPool: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDb: vi.fn(),
	getMongoDbName: vi.fn(() => "testdb"),
	isValidObjectId: vi.fn(() => false),
	coerceObjectId: vi.fn((v) => v),
	getDbType: vi.fn(() => "mongodb"),
}));

describe("Databases Routes (MongoDB)", () => {
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
		it("returns list of MongoDB databases with 200 status", async () => {
			const mockDatabases = [
				{ name: "admin", size: "40.0 KB", owner: "n/a", encoding: "n/a" },
				{ name: "myapp", size: "1.2 MB", owner: "n/a", encoding: "n/a" },
				{ name: "analytics", size: "512.0 MB", owner: "n/a", encoding: "n/a" },
			];

			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual(mockDatabases);
			expect(json.data.dbType).toBe("mongodb");
			expect(mongoDatabaseListDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when no databases exist", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual([]);
			expect(json.data.dbType).toBe("mongodb");
		});

		it("returns single database", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue([
				{ name: "onlydb", size: "1.0 KB", owner: "n/a", encoding: "n/a" },
			]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(1);
			expect(json.data.databases[0].name).toBe("onlydb");
		});

		it("handles large number of databases", async () => {
			const mockDatabases = Array.from({ length: 50 }, (_, i) => ({
				name: `db_${i}`,
				size: `${i} MB`,
				owner: "n/a",
				encoding: "n/a",
			}));

			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(50);
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockRejectedValue(
				new HTTPException(500, { message: "No databases returned from MongoDB" }),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
		});

		it("returns 503 when MongoDB connection is refused", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("returns 503 on MongoDB connection timeout", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockRejectedValue(
				new Error("timeout expired"),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
		});

		it("returns 500 on generic error", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockRejectedValue(
				new Error("Unexpected MongoDB error"),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Unexpected MongoDB error");
		});
	});

	// ============================================
	// GET /databases/current
	// ============================================
	describe("GET /databases/current", () => {
		it("returns current MongoDB database with 200 status", async () => {
			vi.mocked(mongoDatabaseListDao.getCurrentDatabase).mockResolvedValue({
				db: "myapp",
			});

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("myapp");
			expect(json.data.dbType).toBe("mongodb");
			expect(mongoDatabaseListDao.getCurrentDatabase).toHaveBeenCalledTimes(1);
		});

		it("returns dbType as mongodb", async () => {
			vi.mocked(mongoDatabaseListDao.getCurrentDatabase).mockResolvedValue({
				db: "production",
			});

			const res = await app.request("/databases/current");

			const json = await res.json();
			expect(json.data.dbType).toBe("mongodb");
		});

		it("handles db name with underscores and hyphens", async () => {
			vi.mocked(mongoDatabaseListDao.getCurrentDatabase).mockResolvedValue({
				db: "my-production_db",
			});

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("my-production_db");
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			vi.mocked(mongoDatabaseListDao.getCurrentDatabase).mockRejectedValue(
				new HTTPException(500, { message: "Failed to get current db" }),
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection error", async () => {
			vi.mocked(mongoDatabaseListDao.getCurrentDatabase).mockRejectedValue(
				new Error("connection refused"),
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// GET /databases/connection
	// ============================================
	describe("GET /databases/connection", () => {
		it("returns MongoDB connection info with 200 status", async () => {
			const mockInfo = {
				host: "localhost",
				port: 27017,
				user: "n/a",
				database: "myapp",
				version: "7.0.5",
				active_connections: 12,
				max_connections: 812,
			};

			vi.mocked(mongoDatabaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockInfo);
			expect(mongoDatabaseListDao.getDatabaseConnectionInfo).toHaveBeenCalledTimes(1);
		});

		it("handles serverStatus unavailable gracefully", async () => {
			const mockInfo = {
				host: "mongo.prod.example.com",
				port: 27017,
				user: "n/a",
				database: "prod",
				version: "unknown",
				active_connections: 0,
				max_connections: 0,
			};

			vi.mocked(mongoDatabaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.version).toBe("unknown");
			expect(json.data.active_connections).toBe(0);
		});

		it("handles MongoDB Atlas connection info", async () => {
			const mockInfo = {
				host: "cluster0.example.mongodb.net",
				port: 27017,
				user: "n/a",
				database: "atlasdb",
				version: "7.0.5",
				active_connections: 5,
				max_connections: 800,
			};

			vi.mocked(mongoDatabaseListDao.getDatabaseConnectionInfo).mockResolvedValue(mockInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.host).toBe("cluster0.example.mongodb.net");
		});

		it("returns 500 when connection info fails", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabaseConnectionInfo).mockRejectedValue(
				new HTTPException(500, { message: "Failed to get connection info" }),
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection timeout", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabaseConnectionInfo).mockRejectedValue(
				new Error("timeout expired"),
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(503);
		});
	});

	// ============================================
	// Response headers
	// ============================================
	describe("Response headers", () => {
		it("includes CORS headers", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("returns JSON content type", async () => {
			vi.mocked(mongoDatabaseListDao.getDatabasesList).mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});
});
