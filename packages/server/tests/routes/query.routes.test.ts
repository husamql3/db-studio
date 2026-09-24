import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
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
	getDbType: vi.fn(() => "pg"),
	isValidObjectId: vi.fn(),
	coerceObjectId: vi.fn(),
}));

describe("Query Routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		app = createServer().app;
	});

	describe("POST /pg/query", () => {
		it("should return 400 when database query param is missing", async () => {
			const res = await app.request("/api/pg/query", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: "SELECT * FROM users" }),
			});

			expect(res.status).toBe(400);
			expect(mockDao.executeQuery).not.toHaveBeenCalled();
		});

		it("should return 400 when query is missing from body", async () => {
			const res = await app.request("/api/pg/query?db=testdb", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
			expect(mockDao.executeQuery).not.toHaveBeenCalled();
		});
	});
});
