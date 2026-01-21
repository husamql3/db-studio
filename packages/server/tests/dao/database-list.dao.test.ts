import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Mock modules before importing the DAO
const mockQuery = vi.fn();
vi.mock("@/db-manager.js", () => ({
	getDbPool: vi.fn(() => ({
		query: mockQuery,
	})),
}));

vi.mock("@/utils/parse-database-url.js", () => ({
	parseDatabaseUrl: vi.fn(() => ({
		host: "localhost",
		port: 5432,
	})),
}));

import {
	getDatabasesList,
	getCurrentDatabase,
	getDatabaseConnectionInfo,
} from "@/dao/database-list.dao.js";

describe("Database List DAO", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getDatabasesList", () => {
		it("should return list of databases", async () => {
			const mockRows = [
				{ name: "testdb", size: "8192 bytes", owner: "postgres", encoding: "UTF8" },
				{ name: "production", size: "1 GB", owner: "admin", encoding: "UTF8" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabasesList();

			expect(result).toEqual(mockRows);
			expect(mockQuery).toHaveBeenCalledTimes(1);
			expect(mockQuery.mock.calls[0][0]).toContain("pg_catalog.pg_database");
		});

		it("should return single database", async () => {
			const mockRows = [
				{ name: "onlydb", size: "100 MB", owner: "user", encoding: "LATIN1" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabasesList();

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("onlydb");
		});

		it("should throw HTTPException when no databases returned", async () => {
			mockQuery.mockResolvedValue({ rows: [] });

			await expect(getDatabasesList()).rejects.toThrow(HTTPException);
			await expect(getDatabasesList()).rejects.toMatchObject({
				status: 500,
			});
		});

		it("should filter out template databases", async () => {
			const mockRows = [
				{ name: "userdb", size: "50 MB", owner: "user", encoding: "UTF8" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			await getDatabasesList();

			// Verify the query filters templates
			const queryCall = mockQuery.mock.calls[0][0] as string;
			expect(queryCall).toContain("datistemplate = false");
		});

		it("should order databases by name", async () => {
			const mockRows = [
				{ name: "alpha", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "beta", size: "2 MB", owner: "user", encoding: "UTF8" },
				{ name: "gamma", size: "3 MB", owner: "user", encoding: "UTF8" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			await getDatabasesList();

			const queryCall = mockQuery.mock.calls[0][0] as string;
			expect(queryCall).toContain("ORDER BY d.datname");
		});

		it("should handle query error", async () => {
			mockQuery.mockRejectedValue(new Error("Query failed"));

			await expect(getDatabasesList()).rejects.toThrow("Query failed");
		});

		it("should validate response with Zod schema", async () => {
			// Invalid data should cause validation error
			const invalidRows = [
				{ name: 123, size: null, owner: undefined }, // Invalid types
			];
			mockQuery.mockResolvedValue({ rows: invalidRows });

			await expect(getDatabasesList()).rejects.toThrow();
		});

		it("should return databases with various size formats", async () => {
			const mockRows = [
				{ name: "tiny", size: "8192 bytes", owner: "user", encoding: "UTF8" },
				{ name: "small", size: "10 kB", owner: "user", encoding: "UTF8" },
				{ name: "medium", size: "500 MB", owner: "user", encoding: "UTF8" },
				{ name: "large", size: "2 GB", owner: "user", encoding: "UTF8" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabasesList();

			expect(result).toHaveLength(4);
			expect(result.map((d) => d.size)).toEqual([
				"8192 bytes",
				"10 kB",
				"500 MB",
				"2 GB",
			]);
		});

		it("should handle different encodings", async () => {
			const mockRows = [
				{ name: "utf8db", size: "1 MB", owner: "user", encoding: "UTF8" },
				{ name: "latindb", size: "1 MB", owner: "user", encoding: "LATIN1" },
				{ name: "asciidb", size: "1 MB", owner: "user", encoding: "SQL_ASCII" },
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabasesList();

			expect(result.map((d) => d.encoding)).toEqual(["UTF8", "LATIN1", "SQL_ASCII"]);
		});

		it("should handle many databases", async () => {
			const mockRows = Array.from({ length: 100 }, (_, i) => ({
				name: `db_${i}`,
				size: "1 MB",
				owner: "user",
				encoding: "UTF8",
			}));
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabasesList();

			expect(result).toHaveLength(100);
		});
	});

	describe("getCurrentDatabase", () => {
		it("should return current database name", async () => {
			const mockRows = [{ database: "testdb" }];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getCurrentDatabase();

			expect(result).toEqual({ database: "testdb" });
			expect(mockQuery).toHaveBeenCalledTimes(1);
		});

		it("should execute correct query", async () => {
			mockQuery.mockResolvedValue({ rows: [{ database: "test" }] });

			await getCurrentDatabase();

			const queryCall = mockQuery.mock.calls[0][0] as string;
			expect(queryCall).toContain("current_database()");
		});

		it("should throw HTTPException when no database returned", async () => {
			mockQuery.mockResolvedValue({ rows: [] });

			await expect(getCurrentDatabase()).rejects.toThrow(HTTPException);
		});

		it("should handle database with special name", async () => {
			const mockRows = [{ database: "my_special_db_123" }];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getCurrentDatabase();

			expect(result.database).toBe("my_special_db_123");
		});

		it("should handle database with underscore prefix", async () => {
			const mockRows = [{ database: "_internal" }];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getCurrentDatabase();

			expect(result.database).toBe("_internal");
		});

		it("should handle long database name", async () => {
			const longName = "a".repeat(63);
			const mockRows = [{ database: longName }];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getCurrentDatabase();

			expect(result.database).toBe(longName);
		});

		it("should validate with Zod schema", async () => {
			const invalidRows = [{ database: "" }]; // Empty string should fail min(1)
			mockQuery.mockResolvedValue({ rows: invalidRows });

			await expect(getCurrentDatabase()).rejects.toThrow();
		});

		it("should handle query error", async () => {
			mockQuery.mockRejectedValue(new Error("Connection failed"));

			await expect(getCurrentDatabase()).rejects.toThrow("Connection failed");
		});
	});

	describe("getDatabaseConnectionInfo", () => {
		it("should return connection info with all fields", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2 on x86_64-linux",
					database: "testdb",
					user: "postgres",
					host: "127.0.0.1",
					port: 5432,
					active_connections: "5",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(result.version).toBe("PostgreSQL 15.2 on x86_64-linux");
			expect(result.database).toBe("testdb");
			expect(result.user).toBe("postgres");
			expect(result.host).toBe("127.0.0.1");
			expect(result.port).toBe(5432);
			expect(result.active_connections).toBe(5);
			expect(result.max_connections).toBe(100);
		});

		it("should fallback to DATABASE_URL for null host", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "testdb",
					user: "postgres",
					host: null,
					port: null,
					active_connections: "1",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			// Should use fallback from parseDatabaseUrl mock
			expect(result.host).toBe("localhost");
			expect(result.port).toBe(5432);
		});

		it("should coerce connection counts to numbers", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "testdb",
					user: "postgres",
					host: "localhost",
					port: 5432,
					active_connections: "25", // String from DB
					max_connections: "200", // String from DB
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(typeof result.active_connections).toBe("number");
			expect(typeof result.max_connections).toBe("number");
			expect(result.active_connections).toBe(25);
			expect(result.max_connections).toBe(200);
		});

		it("should throw HTTPException when no info returned", async () => {
			mockQuery.mockResolvedValue({ rows: [] });

			await expect(getDatabaseConnectionInfo()).rejects.toThrow(HTTPException);
		});

		it("should handle different PostgreSQL versions", async () => {
			const versions = [
				"PostgreSQL 12.15 (Ubuntu 12.15-1.pgdg22.04+1)",
				"PostgreSQL 13.11",
				"PostgreSQL 14.8",
				"PostgreSQL 15.3 on aarch64-apple-darwin22.4.0",
				"PostgreSQL 16.0",
			];

			for (const version of versions) {
				const mockRows = [
					{
						version,
						database: "testdb",
						user: "postgres",
						host: "localhost",
						port: 5432,
						active_connections: "1",
						max_connections: "100",
					},
				];
				mockQuery.mockResolvedValue({ rows: mockRows });

				const result = await getDatabaseConnectionInfo();
				expect(result.version).toBe(version);
			}
		});

		it("should handle high connection counts", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "production",
					user: "admin",
					host: "prod.db.example.com",
					port: 5432,
					active_connections: "950",
					max_connections: "1000",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(result.active_connections).toBe(950);
			expect(result.max_connections).toBe(1000);
		});

		it("should handle non-standard port", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "testdb",
					user: "postgres",
					host: "localhost",
					port: 5433,
					active_connections: "1",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(result.port).toBe(5433);
		});

		it("should handle IPv6 host", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "testdb",
					user: "postgres",
					host: "::1",
					port: 5432,
					active_connections: "1",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(result.host).toBe("::1");
		});

		it("should execute query with correct selections", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2",
					database: "testdb",
					user: "postgres",
					host: "localhost",
					port: 5432,
					active_connections: "1",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			await getDatabaseConnectionInfo();

			const queryCall = mockQuery.mock.calls[0][0] as string;
			expect(queryCall).toContain("version()");
			expect(queryCall).toContain("current_database()");
			expect(queryCall).toContain("current_user");
			expect(queryCall).toContain("inet_server_addr()");
			expect(queryCall).toContain("inet_server_port()");
			expect(queryCall).toContain("pg_stat_activity");
			expect(queryCall).toContain("max_connections");
		});

		it("should handle query error", async () => {
			mockQuery.mockRejectedValue(new Error("Permission denied"));

			await expect(getDatabaseConnectionInfo()).rejects.toThrow("Permission denied");
		});

		it("should convert version to string", async () => {
			const mockRows = [
				{
					version: "PostgreSQL 15.2", // Already a string
					database: "testdb",
					user: "postgres",
					host: "localhost",
					port: 5432,
					active_connections: "1",
					max_connections: "100",
				},
			];
			mockQuery.mockResolvedValue({ rows: mockRows });

			const result = await getDatabaseConnectionInfo();

			expect(typeof result.version).toBe("string");
		});
	});

	describe("Error scenarios", () => {
		it("should handle pool acquisition failure", async () => {
			mockQuery.mockRejectedValue(new Error("Cannot acquire connection from pool"));

			await expect(getDatabasesList()).rejects.toThrow(
				"Cannot acquire connection from pool"
			);
		});

		it("should handle query timeout", async () => {
			mockQuery.mockRejectedValue(new Error("Query read timeout"));

			await expect(getDatabasesList()).rejects.toThrow("Query read timeout");
		});

		it("should handle invalid SQL response", async () => {
			mockQuery.mockResolvedValue(null as unknown as { rows: unknown[] });

			await expect(getDatabasesList()).rejects.toThrow();
		});

		it("should handle undefined rows", async () => {
			mockQuery.mockResolvedValue({ rows: undefined as unknown as unknown[] });

			await expect(getDatabasesList()).rejects.toThrow();
		});
	});
});
