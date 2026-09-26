import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	createTable: vi.fn(),
	getTableData: vi.fn(),
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
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
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
			const res = await app.request("/api/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableName: "empty_fields_table", fields: [] }),
			});

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

			const res = await app.request("/api/pg/tables?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			expect(res.status).toBe(400);
			expect(mockDao.createTable).not.toHaveBeenCalled();
		});
	});

	describe("GET /pg/tables/:tableName/data", () => {
		it("should return 400 for invalid direction parameter", async () => {
			const res = await app.request("/api/pg/tables/users/data?db=testdb&direction=invalid");

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid order parameter", async () => {
			const res = await app.request("/api/pg/tables/users/data?db=testdb&order=invalid");

			expect(res.status).toBe(400);
			expect(mockDao.getTableData).not.toHaveBeenCalled();
		});

		it("should handle invalid JSON in filters gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request("/api/pg/tables/users/data?db=testdb&filters=invalid-json");

			expect(res.status).toBe(200);
			// Invalid JSON should be parsed as empty array
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ filters: [] }),
			);
		});

		it("should handle invalid JSON in sort gracefully", async () => {
			mockDao.getTableData.mockResolvedValue(mockDataResponse);

			const res = await app.request("/api/pg/tables/users/data?db=testdb&sort=invalid-json");

			expect(res.status).toBe(200);
			// Invalid JSON should be kept as a single-column sort string
			expect(mockDao.getTableData).toHaveBeenCalledWith(
				expect.objectContaining({ sort: "invalid-json" }),
			);
		});
	});
});
