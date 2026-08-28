import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDbPool: vi.fn(),
	getDbType: vi.fn(),
	getMongoClient: vi.fn(),
	getMongoDbName: vi.fn(),
	getMssqlPool: vi.fn(),
	getMysqlPool: vi.fn(),
	getRedisClient: vi.fn(),
	getSqliteDb: vi.fn(),
}));

vi.mock("@/db-manager.js", () => mocks);

import {
	checkDatabaseConnection,
	getDatabaseConnectionDetails,
} from "@/cmd/check-database.js";

describe("database startup check", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reports a safe PostgreSQL destination without credentials", () => {
		mocks.getDbType.mockReturnValue("pg");

		expect(
			getDatabaseConnectionDetails("postgresql://admin:secret@database.internal/app"),
		).toEqual({
			type: "pg",
			name: "PostgreSQL",
			destination: "database.internal:5432",
		});
	});

	it("runs a real Redis ping before reporting a successful connection", async () => {
		const ping = vi.fn().mockResolvedValue("PONG");
		mocks.getRedisClient.mockResolvedValue({ ping });

		await checkDatabaseConnection("redis");

		expect(ping).toHaveBeenCalledOnce();
	});

	it("propagates a failed health check", async () => {
		const connectionError = new Error("Connection refused");
		mocks.getDbPool.mockReturnValue({
			query: vi.fn().mockRejectedValue(connectionError),
		});

		await expect(checkDatabaseConnection("pg")).rejects.toBe(connectionError);
	});
});
