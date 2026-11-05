import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "@/app.js";

const mockDao = vi.hoisted(() => ({
	createTable: vi.fn(),
	getTableData: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
	ADAPTERS: { pg: mockDao, mysql: mockDao, mssql: mockDao, mongodb: mockDao },
	isDatabaseType: (type: string) => ["pg", "mysql", "mssql", "mongodb"].includes(type),
}));

vi.mock("@/open-connections.js", () => ({
	requestConnection: vi.fn(() => ({
		dbType: "pg",
		parsed: { host: "localhost", port: 5432 },
	})),
	getOpenConnection: vi.fn(),
	latestConnectionId: vi.fn(() => null),
}));

const mockDataResponse = {
	data: [{ id: 1, name: "John" }],
	meta: {
		limit: 50,
		total: 1,
		hasNextPage: false,
		hasPreviousPage: false,
		nextCursor: null,
		prevCursor: null,
	},
};

describe("Tables Routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		app = createServer().app;
	});

	describe("POST /pg/tables", () => {
		it("should return 400 when fields array is empty", async () => {
			const res = await app.handle(
				new Request(new URL("/api/pg/tables?db=testdb", "http://localhost"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ tableName: "empty_fields_table", fields: [] }),
				}),
			);

			expect(res.status).toBe(400);
			expect(mockDao.createTable).not.toHaveBeenCalled();
		});

		it("should return 400 when foreign key has invalid onDelete action", async () => {
			const body = {
				tableName: "bad_fk_table",
				fields: [
					{ columnName: "id", columnType: "SERIAL", isPrimaryKey: true },
					{ columnName: "ref_id", columnType: "INTEGER" },
				],
				foreignKeys: [
					{
						columnName: "ref_id",
						referencedTable: "other_table",
						referencedColumn: "id",
						onUpdate: "CASCADE",
						onDelete: "INVALID_ACTION",
					},
				],
			};

			const res = await app.handle(
				new Request(new URL("/api/pg/tables?db=testdb", "http://localhost"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
			);

			expect(res.status).toBe(400);
			expect(mockDao.createTable).not.toHaveBeenCalled();
		});
	});

	describe("GET /pg/tables/:tableName/data", () => {
		it("should return 400 when a sort direction carries SQL (GHSA-vw88-9x6f-fcp5)", async () => {
			const sort = encodeURIComponent(
				JSON.stringify([{ columnName: "id", direction: "ASC, (SELECT pg_sleep(2))" }]),
			);

			const res = await app.handle(
				new Request(
					new URL(`/api/pg/tables/users/data?db=testdb&sort=${sort}`, "http://localhost"),
				),
			);

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should return 400 when a filter is not a filter object", async () => {
			const filters = encodeURIComponent(
				JSON.stringify([{ columnName: "id", operator: "=" }]),
			);

			const res = await app.handle(
				new Request(
					new URL(
						`/api/pg/tables/users/data?db=testdb&filters=${filters}`,
						"http://localhost",
					),
				),
			);

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid direction parameter", async () => {
			const res = await app.handle(
				new Request(
					new URL("/api/pg/tables/users/data?db=testdb&direction=invalid", "http://localhost"),
				),
			);

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid order parameter", async () => {
			const res = await app.handle(
				new Request(
					new URL("/api/pg/tables/users/data?db=testdb&order=invalid", "http://localhost"),
				),
			);

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should handle invalid JSON in filters gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.handle(
				new Request(
					new URL(
						"/api/pg/tables/users/data?db=testdb&filters=invalid-json",
						"http://localhost",
					),
				),
			);

			expect(res.status).toBe(200);
			// Invalid JSON should be parsed as empty array
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ filters: [] }),
			);
		});

		it("should handle invalid JSON in sort gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.handle(
				new Request(
					new URL("/api/pg/tables/users/data?db=testdb&sort=invalid-json", "http://localhost"),
				),
			);

			expect(res.status).toBe(200);
			// Invalid JSON is a single column name, sorted ascending
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ sort: [{ columnName: "invalid-json", direction: "asc" }] }),
			);
		});
	});
});
