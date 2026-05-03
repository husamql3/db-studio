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

	describe("GET /databases", () => {
		it("returns list of MongoDB databases with 200 status", async () => {
			const mockDatabases = [
				{ name: "admin", size: "40.0 KB", owner: "n/a", encoding: "n/a" },
				{ name: "myapp", size: "1.2 MB", owner: "n/a", encoding: "n/a" },
				{ name: "analytics", size: "512.0 MB", owner: "n/a", encoding: "n/a" },
			];
			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual(mockDatabases);
			expect(json.data.dbType).toBe("mongodb");
			expect(mockDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("returns empty array when no databases exist", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toEqual([]);
			expect(json.data.dbType).toBe("mongodb");
		});

		it("returns single database", async () => {
			mockDao.getDatabasesList.mockResolvedValue([
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
			mockDao.getDatabasesList.mockResolvedValue(mockDatabases);

			const res = await app.request("/databases");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.databases).toHaveLength(50);
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new HTTPException(500, { message: "No databases returned from MongoDB" }),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
		});

		it("returns 503 when MongoDB connection is refused", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:27017"),
			);

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.error).toBe("Database connection failed");
		});

		it("returns 503 on MongoDB connection timeout", async () => {
			mockDao.getDatabasesList.mockRejectedValue(new Error("timeout expired"));

			const res = await app.request("/databases");

			expect(res.status).toBe(503);
		});

		it("returns 500 on generic error", async () => {
			mockDao.getDatabasesList.mockRejectedValue(new Error("Unexpected MongoDB error"));

			const res = await app.request("/databases");

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.error).toBe("Unexpected MongoDB error");
		});
	});

	describe("GET /databases/current", () => {
		it("returns current MongoDB database with 200 status", async () => {
			mockDao.getCurrentDatabase.mockResolvedValue({ db: "myapp" });

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("myapp");
			expect(json.data.dbType).toBe("mongodb");
			expect(mockDao.getCurrentDatabase).toHaveBeenCalledTimes(1);
		});

		it("handles db name with underscores and hyphens", async () => {
			mockDao.getCurrentDatabase.mockResolvedValue({ db: "my-production_db" });

			const res = await app.request("/databases/current");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.db).toBe("my-production_db");
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(
				new HTTPException(500, { message: "Failed to get current db" }),
			);

			const res = await app.request("/databases/current");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection error", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(new Error("connection refused"));

			const res = await app.request("/databases/current");

			expect(res.status).toBe(503);
		});
	});

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
			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data).toEqual(mockInfo);
			expect(mockDao.getDatabaseConnectionInfo).toHaveBeenCalledTimes(1);
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
			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockInfo);

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
			mockDao.getDatabaseConnectionInfo.mockResolvedValue(mockInfo);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.host).toBe("cluster0.example.mongodb.net");
		});

		it("returns 500 when connection info fails", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(
				new HTTPException(500, { message: "Failed to get connection info" }),
			);

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(500);
		});

		it("returns 503 on connection timeout", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(new Error("timeout expired"));

			const res = await app.request("/databases/connection");

			expect(res.status).toBe(503);
		});
	});

	describe("Response headers", () => {
		it("includes CORS headers", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		it("returns JSON content type", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);

			const res = await app.request("/databases");

			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});
});
