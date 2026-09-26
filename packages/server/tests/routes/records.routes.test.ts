import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	addRecord: vi.fn(),
	updateRecords: vi.fn(),
	deleteRecords: vi.fn(),
	forceDeleteRecords: vi.fn(),
	bulkInsertRecords: vi.fn(),
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

describe("Records Routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		app = createServer().app;
	});

	it("should return 400 when database query param is missing on POST", async () => {
		const res = await app.request("/api/pg/records", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tableName: "users", data: { name: "Test" } }),
		});

		expect(res.status).toBe(400);
		expect(mockDao.addRecord).not.toHaveBeenCalled();
	});

	it("should return 400 when updates array is empty on PATCH", async () => {
		const res = await app.request("/api/pg/records?db=testdb", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tableName: "users", primaryKey: "id", updates: [] }),
		});

		expect(res.status).toBe(400);
		expect(mockDao.updateRecords).not.toHaveBeenCalled();
	});

	it("should return 400 when primaryKeys is empty on DELETE", async () => {
		const res = await app.request("/api/pg/records?db=testdb", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tableName: "users", primaryKeys: [] }),
		});

		expect(res.status).toBe(400);
		expect(mockDao.deleteRecords).not.toHaveBeenCalled();
	});
});
