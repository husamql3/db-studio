import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "@/utils/create-server.js";

const mockDao = vi.hoisted(() => ({
	executeQuery: vi.fn(),
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

describe("Query Routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		app = createServer().app;
	});

	describe("POST /pg/query", () => {
		it("should return 400 when database query param is missing", async () => {
			const res = await app.handle(
				new Request(new URL("/api/pg/query", "http://localhost"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: "SELECT * FROM users" }),
				}),
			);

			expect(res.status).toBe(400);
			expect(mockDao.executeQuery).not.toHaveBeenCalled();
		});

		it("should return 400 when query is missing from body", async () => {
			const res = await app.handle(
				new Request(new URL("/api/pg/query?db=testdb", "http://localhost"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				}),
			);

			expect(res.status).toBe(400);
			expect(mockDao.executeQuery).not.toHaveBeenCalled();
		});
	});
});
