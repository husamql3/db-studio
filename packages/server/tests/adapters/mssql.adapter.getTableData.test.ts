import { describe, it, expect, vi, beforeEach } from "vitest";
import { HTTPException } from "hono/http-exception";

const mockMssqlPool = vi.hoisted(() => vi.fn());

vi.mock("@/db-manager.js", () => ({
	getMssqlPool: mockMssqlPool,
	getDbPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getMongoDb: vi.fn(),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";

function makeRequest(recordset: unknown[]) {
	const req = { input: vi.fn(), query: vi.fn() };
	req.input.mockReturnValue(req);
	req.query.mockResolvedValue({ recordset, rowsAffected: [recordset.length] });
	return req;
}

function makePool(countRecordset: unknown[], dataRecordset: unknown[]) {
	const pool = { request: vi.fn() };
	pool.request
		.mockReturnValueOnce(makeRequest(countRecordset))
		.mockReturnValueOnce(makeRequest(dataRecordset));
	return pool;
}

describe("MsSqlAdapter.getTableData()", () => {
	let adapter: MsSqlAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MsSqlAdapter();
	});

	describe("basic pagination", () => {
		it("returns rows with correct total and no next page when result fits in one page", async () => {
			const rows = [
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			];
			mockMssqlPool.mockResolvedValue(makePool([{ total: 2 }], rows));

			const result = await adapter.getTableData({
				tableName: "users",
				db: "testdb",
				limit: 50,
			});

			expect(result.meta.total).toBe(2);
			expect(result.meta.hasNextPage).toBe(false);
			expect(result.meta.hasPreviousPage).toBe(false);
			expect(result.meta.nextCursor).toBeNull();
			expect(result.meta.prevCursor).toBeNull();
			expect(result.data).toHaveLength(2);
		});

		it("detects hasNextPage when result set exceeds limit", async () => {
			const limit = 3;
			// adapter fetches limit+1 to detect next page
			const extraRows = [
				{ id: 1 },
				{ id: 2 },
				{ id: 3 },
				{ id: 4 }, // the extra row
			];
			mockMssqlPool.mockResolvedValue(makePool([{ total: 10 }], extraRows));

			const result = await adapter.getTableData({
				tableName: "products",
				db: "testdb",
				limit,
			});

			expect(result.meta.hasNextPage).toBe(true);
			expect(result.meta.nextCursor).not.toBeNull();
			expect(result.data).toHaveLength(3); // trimmed to limit
		});

		it("does not include extra row in returned data", async () => {
			const limit = 2;
			const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]; // 3 rows returned for limit=2
			mockMssqlPool.mockResolvedValue(makePool([{ total: 5 }], rows));

			const result = await adapter.getTableData({ tableName: "t", db: "db", limit });

			expect(result.data).toHaveLength(2);
		});

		it("uses default limit of 50 when not provided", async () => {
			mockMssqlPool.mockResolvedValue(makePool([{ total: 0 }], []));

			const result = await adapter.getTableData({ tableName: "t", db: "db" });

			expect(result.meta.limit).toBe(50);
		});
	});

	describe("cursor-based pagination (OFFSET)", () => {
		it("starts at offset 0 with no cursor", async () => {
			mockMssqlPool.mockResolvedValue(makePool([{ total: 5 }], [{ id: 1 }]));

			const result = await adapter.getTableData({ tableName: "t", db: "db", limit: 2 });

			expect(result.meta.hasPreviousPage).toBe(false);
			expect(result.meta.prevCursor).toBeNull();
		});

		it("sets prevCursor when offset > 0 via cursor", async () => {
			// Build a cursor encoding offset=5
			const adapterInstance = new MsSqlAdapter();
			// Access private method via cast
			const cursor = (adapterInstance as unknown as { makeCursor: (n: number) => string }).makeCursor(5);

			mockMssqlPool.mockResolvedValue(makePool([{ total: 20 }], [{ id: 6 }]));

			const result = await adapter.getTableData({
				tableName: "t",
				db: "db",
				limit: 5,
				cursor,
			});

			expect(result.meta.hasPreviousPage).toBe(true);
			expect(result.meta.prevCursor).not.toBeNull();
		});

		it("encodes next cursor pointing to next offset when more pages exist", async () => {
			const limit = 5;
			const sixRows = Array.from({ length: limit + 1 }, (_, i) => ({ id: i + 1 }));
			mockMssqlPool.mockResolvedValue(makePool([{ total: 20 }], sixRows));

			const result = await adapter.getTableData({ tableName: "t", db: "db", limit });

			expect(result.meta.nextCursor).not.toBeNull();
			// Decode the cursor and verify the offset
			const decoded = JSON.parse(
				Buffer.from(result.meta.nextCursor as string, "base64url").toString(),
			);
			expect(decoded.values._offset).toBe(limit);
		});
	});

	describe("filtering", () => {
		it("passes filter values to pool requests", async () => {
			const pool = makePool([{ total: 1 }], [{ id: 1, status: "active" }]);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({
				tableName: "users",
				db: "db",
				filters: [{ columnName: "status", operator: "=", value: "active" }],
			});

			// Both the count request and data request should have received the filter value
			const requestCalls = (pool.request as ReturnType<typeof vi.fn>).mock.calls;
			expect(requestCalls).toHaveLength(2);
		});

		it("handles IS NULL filter without binding a parameter", async () => {
			const pool = makePool([{ total: 0 }], []);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({
				tableName: "users",
				db: "db",
				filters: [{ columnName: "deletedAt", operator: "is", value: "null" }],
			});

			// No extra parameter should be bound for IS NULL
			const countReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[0]?.value;
			// input() should not have been called for the IS NULL condition
			expect(countReq.input).not.toHaveBeenCalledWith(expect.stringMatching(/^p\d+/), "null");
		});
	});

	describe("sorting", () => {
		it("applies sort clause when sort params provided", async () => {
			const pool = makePool([{ total: 1 }], [{ id: 1 }]);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({
				tableName: "products",
				db: "db",
				sort: [{ columnName: "price", direction: "desc" }],
				order: "desc",
			});

			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[1]?.value;
			const sqlArg: string = (dataReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(sqlArg).toContain("ORDER BY [price] DESC");
		});

		it("falls back to ORDER BY (SELECT NULL) with no sort params", async () => {
			const pool = makePool([{ total: 0 }], []);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "t", db: "db", sort: [], order: "asc" });

			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[1]?.value;
			const sqlArg: string = (dataReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(sqlArg).toContain("ORDER BY (SELECT NULL)");
		});
	});

	describe("SQL query structure", () => {
		it("issues a COUNT query and a data SELECT query", async () => {
			const pool = makePool([{ total: 2 }], [{ id: 1 }, { id: 2 }]);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "orders", db: "db" });

			const countReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[0]?.value;
			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[1]?.value;

			const countSql: string = (countReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			const dataSql: string = (dataReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

			expect(countSql).toContain("COUNT(*)");
			expect(countSql).toContain("[orders]");
			expect(dataSql).toContain("SELECT *");
			expect(dataSql).toContain("[orders]");
			expect(dataSql).toContain("OFFSET");
			expect(dataSql).toContain("FETCH NEXT");
		});

		it("uses bracket-quoted table name", async () => {
			const pool = makePool([{ total: 0 }], []);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "my table", db: "db" });

			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[1]?.value;
			const sql: string = (dataReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(sql).toContain("[my table]");
		});
	});

	describe("error handling", () => {
		it("wraps connection errors as 503", async () => {
			const connErr = new Error("connect ECONNREFUSED 127.0.0.1:1433");
			mockMssqlPool.mockRejectedValue(connErr);

			await expect(adapter.getTableData({ tableName: "t", db: "db" })).rejects.toMatchObject({
				status: 503,
			});
		});

		it("wraps SQL Server login failures as 503", async () => {
			const loginErr = new Error("Login failed for user 'sa'");
			mockMssqlPool.mockRejectedValue(loginErr);

			await expect(adapter.getTableData({ tableName: "t", db: "db" })).rejects.toMatchObject({
				status: 503,
			});
		});

		it("wraps timeout errors as 503", async () => {
			const timeoutErr = new Error("timeout expired");
			mockMssqlPool.mockRejectedValue(timeoutErr);

			await expect(adapter.getTableData({ tableName: "t", db: "db" })).rejects.toMatchObject({
				status: 503,
			});
		});

		it("wraps unknown errors as 500", async () => {
			const pool = makePool([{ total: 0 }], []);
			(pool.request as ReturnType<typeof vi.fn>)
				.mockReset()
				.mockReturnValueOnce({
					input: vi.fn().mockReturnThis(),
					query: vi.fn().mockRejectedValue(new Error("Unexpected MSSQL error")),
				});
			mockMssqlPool.mockResolvedValue(pool);

			await expect(adapter.getTableData({ tableName: "t", db: "db" })).rejects.toMatchObject({
				status: 500,
			});
		});

		it("passes through HTTPException unchanged", async () => {
			const pool = makePool([{ total: 0 }], []);
			(pool.request as ReturnType<typeof vi.fn>)
				.mockReset()
				.mockReturnValueOnce({
					input: vi.fn().mockReturnThis(),
					query: vi.fn().mockRejectedValue(new HTTPException(422, { message: "Unprocessable" })),
				});
			mockMssqlPool.mockResolvedValue(pool);

			await expect(adapter.getTableData({ tableName: "t", db: "db" })).rejects.toMatchObject({
				status: 422,
			});
		});
	});

	describe("empty results", () => {
		it("returns empty data array with zero total", async () => {
			mockMssqlPool.mockResolvedValue(makePool([{ total: 0 }], []));

			const result = await adapter.getTableData({ tableName: "t", db: "db" });

			expect(result.data).toEqual([]);
			expect(result.meta.total).toBe(0);
			expect(result.meta.hasNextPage).toBe(false);
		});

		it("handles missing total field in count result gracefully", async () => {
			mockMssqlPool.mockResolvedValue(makePool([{}], []));

			const result = await adapter.getTableData({ tableName: "t", db: "db" });

			expect(result.meta.total).toBe(0);
		});
	});
});
