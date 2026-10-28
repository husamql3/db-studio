import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPipeline = vi.hoisted(() => ({
	scan: vi.fn(),
	exec: vi.fn(),
}));

const mockClient = vi.hoisted(() => ({
	pipeline: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { REDIS_TABLES, RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter — tables", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockGetRedisClient.mockResolvedValue(mockClient);
		mockPipeline.scan.mockReturnThis();
		mockClient.pipeline.mockReturnValue(mockPipeline);
		adapter = new RedisAdapter();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getTablesList", () => {
		it("returns the six fixed Redis type-tables with per-type counts", async () => {
			mockPipeline.exec.mockResolvedValue([
				[null, ["0", ["a", "b", "c"]]],
				[null, ["0", ["k1", "k2"]]],
				[null, ["0", []]],
				[null, ["0", ["s1"]]],
				[null, ["0", ["z1", "z2", "z3", "z4"]]],
				[null, ["0", []]],
			]);

			const tables = await adapter.getTablesList("0");
			expect(tables.map((t) => t.tableName)).toEqual([...REDIS_TABLES]);
			expect(tables.map((t) => t.rowCount)).toEqual([3, 2, 0, 1, 4, 0]);
		});

		it("caches counts for 30 seconds", async () => {
			mockPipeline.exec.mockResolvedValue([
				[null, ["0", ["a"]]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
			]);

			await adapter.getTablesList("0");
			await adapter.getTablesList("0");
			expect(mockClient.pipeline).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(31_000);
			await adapter.getTablesList("0");
			expect(mockClient.pipeline).toHaveBeenCalledTimes(2);
		});
	});
});
