import { describe, it, expect, vi, beforeEach } from "vitest";

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
		.mockReturnValueOnce(makeRequest([]))
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

	describe("SQL query structure", () => {
		it("issues a COUNT query and a data SELECT query", async () => {
			const pool = makePool([{ total: 2 }], [{ id: 1 }, { id: 2 }]);
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "orders", db: "db" });

			const countReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[1]?.value;
			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[2]?.value;

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

			const dataReq = (pool.request as ReturnType<typeof vi.fn>).mock.results[2]?.value;
			const sql: string = (dataReq.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
			expect(sql).toContain("[my table]");
		});
	});
});
