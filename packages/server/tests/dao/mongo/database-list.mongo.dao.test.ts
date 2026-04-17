import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Shared mock references
const mockServerStatus = vi.fn();
const mockListDatabases = vi.fn();
const mockAdmin = {
	listDatabases: mockListDatabases,
	serverStatus: mockServerStatus,
};
const mockClient = {
	db: vi.fn(() => ({ admin: vi.fn(() => mockAdmin) })),
};

vi.mock("@/db-manager.js", () => ({
	getMongoClient: vi.fn(() => Promise.resolve(mockClient)),
	getMongoDbName: vi.fn(() => "testdb"),
}));

vi.mock("@/utils/parse-database-url.js", () => ({
	parseDatabaseUrl: vi.fn(() => ({ host: "localhost", port: 27017 })),
}));

import {
	getMongoDatabasesList,
	getMongoCurrentDatabase,
	getMongoConnectionInfo,
} from "@/dao/mongo/database-list.dao.js";

describe("MongoDB Database List DAO", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================
	// getMongoDatabasesList
	// ============================================
	describe("getMongoDatabasesList", () => {
		it("returns a formatted list of databases", async () => {
			mockListDatabases.mockResolvedValue({
				databases: [
					{ name: "admin", sizeOnDisk: 40960 },
					{ name: "myapp", sizeOnDisk: 1258291 },
					{ name: "analytics", sizeOnDisk: 536870912 },
				],
			});

			const result = await getMongoDatabasesList();

			expect(result).toHaveLength(3);
			expect(result[0].name).toBe("admin");
			expect(result[0].owner).toBe("n/a");
			expect(result[0].encoding).toBe("n/a");
			expect(result[0].size).toBeDefined();
		});

		it("formats byte sizes in human-readable units", async () => {
			mockListDatabases.mockResolvedValue({
				databases: [
					{ name: "tiny", sizeOnDisk: 512 },
					{ name: "medium", sizeOnDisk: 1048576 },
					{ name: "large", sizeOnDisk: 1073741824 },
				],
			});

			const result = await getMongoDatabasesList();

			expect(result[0].size).toContain("B");
			expect(result[1].size).toContain("MB");
			expect(result[2].size).toContain("GB");
		});

		it("handles sizeOnDisk of 0", async () => {
			mockListDatabases.mockResolvedValue({
				databases: [{ name: "empty", sizeOnDisk: 0 }],
			});

			const result = await getMongoDatabasesList();

			expect(result[0].size).toBe("0.0 B");
		});

		it("throws HTTPException 500 when no databases are returned", async () => {
			mockListDatabases.mockResolvedValue({ databases: [] });

			await expect(getMongoDatabasesList()).rejects.toThrow(HTTPException);
			await expect(getMongoDatabasesList()).rejects.toMatchObject({ status: 500 });
		});

		it("throws HTTPException 500 when databases array is null/undefined", async () => {
			mockListDatabases.mockResolvedValue({ databases: undefined });

			await expect(getMongoDatabasesList()).rejects.toThrow(HTTPException);
		});

		it("propagates errors from listDatabases", async () => {
			mockListDatabases.mockRejectedValue(new Error("listDatabases failed"));

			await expect(getMongoDatabasesList()).rejects.toThrow("listDatabases failed");
		});

		it("returns single database correctly", async () => {
			mockListDatabases.mockResolvedValue({
				databases: [{ name: "onlydb", sizeOnDisk: 8192 }],
			});

			const result = await getMongoDatabasesList();

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("onlydb");
		});

		it("handles large number of databases", async () => {
			const databases = Array.from({ length: 50 }, (_, i) => ({
				name: `db_${i}`,
				sizeOnDisk: i * 1024 * 1024,
			}));
			mockListDatabases.mockResolvedValue({ databases });

			const result = await getMongoDatabasesList();

			expect(result).toHaveLength(50);
		});
	});

	// ============================================
	// getMongoCurrentDatabase
	// ============================================
	describe("getMongoCurrentDatabase", () => {
		it("returns the current database name from getMongoDbName", async () => {
			const { getMongoDbName } = await import("@/db-manager.js");
			vi.mocked(getMongoDbName).mockReturnValue("myapp");

			const result = await getMongoCurrentDatabase();

			expect(result).toEqual({ db: "myapp" });
		});

		it("returns the exact database name set in the URL", async () => {
			const { getMongoDbName } = await import("@/db-manager.js");
			vi.mocked(getMongoDbName).mockReturnValue("production_2025");

			const result = await getMongoCurrentDatabase();

			expect(result.db).toBe("production_2025");
		});

		it("does not call MongoDB server for current db name", async () => {
			await getMongoCurrentDatabase();

			expect(mockListDatabases).not.toHaveBeenCalled();
			expect(mockServerStatus).not.toHaveBeenCalled();
		});
	});

	// ============================================
	// getMongoConnectionInfo
	// ============================================
	describe("getMongoConnectionInfo", () => {
		it("returns full connection info with server version", async () => {
			mockServerStatus.mockResolvedValue({
				version: "7.0.5",
				connections: { current: 12, available: 800 },
			});
			const { getMongoDbName } = await import("@/db-manager.js");
			vi.mocked(getMongoDbName).mockReturnValue("myapp");

			const result = await getMongoConnectionInfo();

			expect(result.host).toBe("localhost");
			expect(result.port).toBe(27017);
			expect(result.database).toBe("myapp");
			expect(result.version).toBe("7.0.5");
			expect(result.active_connections).toBe(12);
			expect(result.max_connections).toBe(812);
			expect(result.user).toBe("n/a");
		});

		it("falls back to 'unknown' version when serverStatus fails", async () => {
			mockServerStatus.mockRejectedValue(new Error("Unauthorized"));

			const result = await getMongoConnectionInfo();

			expect(result.version).toBe("unknown");
		});

		it("sets active_connections to 0 when serverStatus fails", async () => {
			mockServerStatus.mockRejectedValue(new Error("Unauthorized"));

			const result = await getMongoConnectionInfo();

			expect(result.active_connections).toBe(0);
			expect(result.max_connections).toBe(0);
		});

		it("calculates max_connections as current + available", async () => {
			mockServerStatus.mockResolvedValue({
				version: "7.0.5",
				connections: { current: 5, available: 995 },
			});

			const result = await getMongoConnectionInfo();

			expect(result.max_connections).toBe(1000);
		});

		it("uses host and port from parseDatabaseUrl", async () => {
			const { parseDatabaseUrl } = await import("@/utils/parse-database-url.js");
			vi.mocked(parseDatabaseUrl).mockReturnValue({
				host: "mongo.prod.example.com",
				port: 27017,
			} as never);
			mockServerStatus.mockResolvedValue({ version: "6.0.0", connections: {} });

			const result = await getMongoConnectionInfo();

			expect(result.host).toBe("mongo.prod.example.com");
		});
	});
});
