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

/** A pool whose queries return no rows; `queries` records their SQL in order. */
function makePool() {
	const queries: string[] = [];
	const pool = {
		request: () => {
			const req = {
				input: () => req,
				query: async (sql: string) => {
					queries.push(sql);
					return { recordset: [], rowsAffected: [0] };
				},
			};
			return req;
		},
	};
	return { pool, queries };
}

describe("MsSqlAdapter.getTableData()", () => {
	let adapter: MsSqlAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		adapter = new MsSqlAdapter();
	});

	describe("SQL query structure", () => {
		it("issues a COUNT query and a data SELECT query", async () => {
			const { pool, queries } = makePool();
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "orders", db: "db" });

			const countSql = queries.find((sql) => sql.includes("COUNT(*)"));
			const dataSql = queries.find((sql) => sql.includes("OFFSET"));

			expect(countSql).toContain("COUNT(*)");
			expect(countSql).toContain("[orders]");
			expect(dataSql).toContain("SELECT *");
			expect(dataSql).toContain("[orders]");
			expect(dataSql).toContain("OFFSET");
			expect(dataSql).toContain("FETCH NEXT");
		});

		it("uses bracket-quoted table name", async () => {
			const { pool, queries } = makePool();
			mockMssqlPool.mockResolvedValue(pool);

			await adapter.getTableData({ tableName: "my table", db: "db" });

			expect(queries.find((sql) => sql.includes("OFFSET"))).toContain("[my table]");
		});
	});
});
