import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

import { createServer } from "@/utils/create-server.js";
import * as mssqlDatabaseListDao from "@/dao/mssql/database-list.mssql.dao.js";

vi.mock("@/dao/mssql/database-list.mssql.dao.js", () => ({
	getDatabasesList: vi.fn(),
	getCurrentDatabase: vi.fn(),
	getDatabaseConnectionInfo: vi.fn(),
}));

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

vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({ query: vi.fn() })),
	getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
	getMssqlPool: vi.fn(async () => ({ request: vi.fn() })),
	getDbType: vi.fn(() => "mssql"),
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
			vi.mocked(mssqlDatabaseListDao.getDatabasesList).mockResolvedValue([
				{ name: "master", size: "512 MB" },
				{ name: "appdb", size: "256 MB" },
			]);

			const res = await app.request("/databases");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data.dbType).toBe("mssql");
			expect(json.data.databases).toHaveLength(2);
			expect(mssqlDatabaseListDao.getDatabasesList).toHaveBeenCalledTimes(1);
		});

		it("returns 503 when SQL Server connection fails", async () => {
			vi.mocked(mssqlDatabaseListDao.getDatabasesList).mockRejectedValue(
				new Error("connect ECONNREFUSED 127.0.0.1:1433")
			);

			const res = await app.request("/databases");
			expect(res.status).toBe(503);
		});

		it("returns 500 on generic database error", async () => {
			vi.mocked(mssqlDatabaseListDao.getDatabasesList).mockRejectedValue(
				new Error("Unexpected SQL Server error")
			);

			const res = await app.request("/databases");
			expect(res.status).toBe(500);
		});
	});

	describe("GET /databases/current", () => {
		it("returns current database and dbType", async () => {
			vi.mocked(mssqlDatabaseListDao.getCurrentDatabase).mockResolvedValue({
				db: "appdb",
			});

			const res = await app.request("/databases/current");
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.data).toEqual({ db: "appdb", dbType: "mssql" });
		});

		it("returns 500 when DAO throws HTTPException", async () => {
			vi.mocked(mssqlDatabaseListDao.getCurrentDatabase).mockRejectedValue(
				new HTTPException(500, { message: "No current database returned" })
			);

			const res = await app.request("/databases/current");
			expect(res.status).toBe(500);
		});
	});

	describe("GET /databases/connection", () => {
		it("returns SQL Server connection info", async () => {
			vi.mocked(mssqlDatabaseListDao.getDatabaseConnectionInfo).mockResolvedValue({
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
			vi.mocked(mssqlDatabaseListDao.getDatabaseConnectionInfo).mockRejectedValue(
				new Error("timeout expired")
			);

			const res = await app.request("/databases/connection");
			expect(res.status).toBe(503);
		});
	});

	describe("Response headers", () => {
		it("includes CORS and JSON headers", async () => {
			vi.mocked(mssqlDatabaseListDao.getDatabasesList).mockResolvedValue([]);
			const res = await app.request("/databases");

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(res.headers.get("Content-Type")).toContain("application/json");
		});
	});
});
