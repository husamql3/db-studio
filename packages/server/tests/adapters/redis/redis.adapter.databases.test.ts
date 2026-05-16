import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = vi.hoisted(() => ({
	call: vi.fn(),
	info: vi.fn(),
	scan: vi.fn(),
	options: { host: "127.0.0.1", port: 6379, db: 0, username: "" },
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());
const mockGetRedisDefaultDb = vi.hoisted(() => vi.fn(() => 0));

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: mockGetRedisDefaultDb,
}));

import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter — databases", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRedisClient.mockResolvedValue(mockClient);
		mockGetRedisDefaultDb.mockReturnValue(0);
		adapter = new RedisAdapter();
	});

	describe("getDatabasesList", () => {
		it("returns all configured logical DBs with key counts", async () => {
			mockClient.call.mockImplementation(async (cmd: string, ...args: unknown[]) => {
				if (cmd === "CONFIG" && args[0] === "GET" && args[1] === "databases") {
					return ["databases", "4"];
				}
				return null;
			});
			mockClient.info.mockResolvedValue(
				"# Keyspace\r\ndb0:keys=5,expires=1,avg_ttl=0\r\ndb2:keys=10,expires=0,avg_ttl=0\r\n",
			);

			const list = await adapter.getDatabasesList();
			expect(list).toHaveLength(4);
			expect(list[0]).toEqual({ name: "0", size: "5 keys", owner: "n/a", encoding: "n/a" });
			expect(list[1]).toEqual({ name: "1", size: "0 keys", owner: "n/a", encoding: "n/a" });
			expect(list[2]).toEqual({ name: "2", size: "10 keys", owner: "n/a", encoding: "n/a" });
		});

		it("falls back to 16 databases when CONFIG GET returns nothing useful", async () => {
			mockClient.call.mockResolvedValue([]);
			mockClient.info.mockResolvedValue("# Keyspace\r\n");
			const list = await adapter.getDatabasesList();
			expect(list).toHaveLength(16);
			expect(list[0].size).toBe("0 keys");
		});

		it("wraps connection errors to 503", async () => {
			mockClient.call.mockRejectedValue(
				Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
			);
			await expect(adapter.getDatabasesList()).rejects.toMatchObject({ status: 503 });
		});
	});

	describe("getCurrentDatabase", () => {
		it("returns the default DB index from the URL", async () => {
			mockGetRedisDefaultDb.mockReturnValue(3);
			const result = await adapter.getCurrentDatabase();
			expect(result).toEqual({ db: "3" });
		});
	});

	describe("getDatabaseConnectionInfo", () => {
		it("pulls host/port/version/connection counts from INFO", async () => {
			mockClient.info.mockImplementation(async (section: string) => {
				if (section === "server") return "# Server\r\nredis_version:7.4.0\r\n";
				if (section === "clients")
					return "# Clients\r\nconnected_clients:3\r\nmaxclients:10000\r\n";
				return "";
			});
			mockClient.call.mockResolvedValue([]);

			const info = await adapter.getDatabaseConnectionInfo();
			expect(info).toMatchObject({
				host: "127.0.0.1",
				port: 6379,
				user: "default",
				database: "0",
				version: "7.4.0",
				active_connections: 3,
				max_connections: 10000,
			});
		});

		it("falls back to CONFIG GET maxclients when INFO omits it", async () => {
			mockClient.info.mockImplementation(async (section: string) => {
				if (section === "server") return "# Server\r\nredis_version:7.0.0\r\n";
				return "# Clients\r\nconnected_clients:1\r\n";
			});
			mockClient.call.mockImplementation(async (cmd: string, sub: string, key: string) => {
				if (cmd === "CONFIG" && sub === "GET" && key === "maxclients") {
					return ["maxclients", "200"];
				}
				return null;
			});

			const info = await adapter.getDatabaseConnectionInfo();
			expect(info.max_connections).toBe(200);
		});
	});
});
