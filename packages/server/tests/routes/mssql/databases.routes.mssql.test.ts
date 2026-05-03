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
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Databases Routes (MSSQL)", () => {
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
		it("returns MSSQL database list", async () => {
			mockDao.getDatabasesList.mockResolvedValue([
				{ name: "master", size: "512 MB" },
				{ name: "appdb", size: "256 MB" },
			]);

			const res = await app.request("/databases");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.dbType).toBe("mssql");
			expect(json.data.databases).toHaveLength(2);
			expect(mockDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("returns 503 when SQL Server connection fails", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433"),
			);

			const res = await app.request("/databases");
			expect(res.status).toBe(503);
		});

		it("returns 500 on generic database error", async () => {
			mockDao.getDatabasesList.mockRejectedValue(
				new Error("Unexpected SQL Server error"),
			);

			const res = await app.request("/databases");
			expect(res.status).toBe(500);
		});
	});

	describe("GET /databases/current", () => {
		it("returns current database and dbType", async () => {
			mockDao.getCurrentDatabase.mockResolvedValue({ db: "appdb" });

			const res = await app.request("/databases/current");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toEqual({ db: "appdb", dbType: "mssql" });
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			mockDao.getCurrentDatabase.mockRejectedValue(
				new HTTPException(500, { message: "No current database returned" }),
			);

			const res = await app.request("/databases/current");
			expect(res.status).toBe(500);
		});
	});

	describe("GET /databases/connection", () => {
		it("returns SQL Server connection info", async () => {
			mockDao.getDatabaseConnectionInfo.mockResolvedValue({
				version: "Microsoft SQL Server 2022",
				database: "appdb",
				user: "sa",
				host: "localhost",
				port: 1433,
				active_connections: 4,
				max_connections: 32767,
			});

			const res = await app.request("/databases/connection");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.port).toBe(1433);
			expect(json.data.version).toContain("SQL Server");
		});

		it("returns 503 on connection timeout", async () => {
			mockDao.getDatabaseConnectionInfo.mockRejectedValue(new Error("timeout expired"));

			const res = await app.request("/databases/connection");
			expect(res.status).toBe(503);
		});
	});

	describe("Response headers", () => {
		it("includes CORS and JSON headers", async () => {
			mockDao.getDatabasesList.mockResolvedValue([]);
			const res = await app.request("/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});
});
