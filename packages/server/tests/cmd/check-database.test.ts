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

	it("bounds the PostgreSQL startup query", async () => {
		vi.useFakeTimers();
		const query = vi.fn().mockReturnValue(new Promise(() => undefined));
		mocks.getDbPool.mockReturnValue({ query });

		try {
			const result = expect(checkDatabaseConnection("pg")).rejects.toThrow(
				"Database startup check timed out",
			);
			await vi.advanceTimersByTimeAsync(2_000);
			await result;
		} finally {
			vi.useRealTimers();
		}

		expect(query).toHaveBeenCalledWith("SELECT 1");
	});

	it("propagates a failed health check", async () => {
		const connectionError = new Error("Connection refused");
		mocks.getDbPool.mockReturnValue({
			query: vi.fn().mockRejectedValue(connectionError),
		});

		await expect(checkDatabaseConnection("pg")).rejects.toBe(connectionError);
	});
});
