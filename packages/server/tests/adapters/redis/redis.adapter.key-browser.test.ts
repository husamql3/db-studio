import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = vi.hoisted(() => ({
	scanBuffer: vi.fn(),
	pipeline: vi.fn(),
	callBuffer: vi.fn(),
	call: vi.fn(),
	pttl: vi.fn(),
	strlen: vi.fn(),
	getrangeBuffer: vi.fn(),
	hlen: vi.fn(),
	hscanBuffer: vi.fn(),
	llen: vi.fn(),
	lrangeBuffer: vi.fn(),
	scard: vi.fn(),
	sscanBuffer: vi.fn(),
	zcard: vi.fn(),
	zscanBuffer: vi.fn(),
	xlen: vi.fn(),
	xrangeBuffer: vi.fn(),
	xrevrangeBuffer: vi.fn(),
	watch: vi.fn(),
	unwatch: vi.fn(),
	quit: vi.fn(),
	disconnect: vi.fn(),
	exists: vi.fn(),
	multi: vi.fn(),
}));

const mockPipeline = vi.hoisted(() => ({
	call: vi.fn(),
	pttl: vi.fn(),
	exec: vi.fn(),
}));

const mockTransaction = vi.hoisted(() => ({
	set: vi.fn(),
	hset: vi.fn(),
	rpush: vi.fn(),
	sadd: vi.fn(),
	zadd: vi.fn(),
	xadd: vi.fn(),
	pexpire: vi.fn(),
	persist: vi.fn(),
	rename: vi.fn(),
	hdel: vi.fn(),
	lpush: vi.fn(),
	lset: vi.fn(),
	lrem: vi.fn(),
	srem: vi.fn(),
	zrem: vi.fn(),
	xdel: vi.fn(),
	del: vi.fn(),
	exec: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());
const mockGetIsolatedRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getIsolatedRedisClient: mockGetIsolatedRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter key browser", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRedisClient.mockResolvedValue(mockClient);
		mockGetIsolatedRedisClient.mockResolvedValue(mockClient);
		mockClient.pipeline.mockReturnValue(mockPipeline);
		mockPipeline.call.mockReturnThis();
		mockPipeline.pttl.mockReturnThis();
		for (const method of Object.values(mockTransaction)) method.mockReturnValue(mockTransaction);
		mockTransaction.exec.mockResolvedValue([]);
		mockClient.multi.mockReturnValue(mockTransaction);
		mockClient.watch.mockResolvedValue("OK");
		mockClient.unwatch.mockResolvedValue("OK");
		mockClient.quit.mockResolvedValue("OK");
		mockClient.exists.mockResolvedValue(0);
		adapter = new RedisAdapter();
	});

	it("creates a string key atomically without overwriting", async () => {
		mockClient.callBuffer.mockResolvedValue(Buffer.from("serialized-created-key"));

		const result = await adapter.createKey({
			db: "0",
			key: { base64: "Z3JlZXRpbmc", utf8: "greeting" },
			type: "string",
			value: { kind: "string", value: { base64: "aGVsbG8", utf8: "hello" } },
			ttlMs: 60_000,
		});

		expect(mockClient.watch).toHaveBeenCalledWith(Buffer.from("greeting"));
		expect(mockGetIsolatedRedisClient).toHaveBeenCalledWith(0);
		expect(mockTransaction.set).toHaveBeenCalledWith(
			Buffer.from("greeting"),
			Buffer.from("hello"),
		);
		expect(mockTransaction.pexpire).toHaveBeenCalledWith(Buffer.from("greeting"), 60_000);
		expect(result).toMatchObject({
			key: { base64: "Z3JlZXRpbmc", utf8: "greeting" },
			deleted: false,
		});
	});

	it("rejects a stale mutation with a 409 conflict", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "DUMP") return Promise.resolve(Buffer.from("new-server-value"));
			if (command === "TYPE") return Promise.resolve(Buffer.from("string"));
			return Promise.resolve(null);
		});
		mockClient.pttl.mockResolvedValue(-1);

		await expect(
			adapter.applyKeyAction({
				db: "0",
				key: "Z3JlZXRpbmc",
				expectedRevision: "stale-revision",
				force: false,
				operation: { action: "setString", value: { base64: "aGk", utf8: "hi" } },
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(mockClient.multi).not.toHaveBeenCalled();
	});

	it("scans keys without losing binary names", async () => {
		mockClient.scanBuffer.mockResolvedValue([
			Buffer.from("42"),
			[Buffer.from("user:1"), Buffer.from([0xff, 0x00, 0x61])],
		]);
		mockPipeline.exec.mockResolvedValue([
			[null, "hash"],
			[null, 60_000],
			[null, 128],
			[null, "string"],
			[null, -1],
			[null, null],
		]);

		const result = await adapter.scanKeys({
			db: "0",
			limit: 50,
			exactPattern: false,
		});

		expect(result.keys).toEqual([
			{
				key: { base64: "dXNlcjox", utf8: "user:1" },
				type: "hash",
				ttlMs: 60_000,
				memoryBytes: 128,
			},
			{
				key: { base64: "_wBh" },
				type: "string",
				ttlMs: -1,
				memoryBytes: null,
			},
		]);
		expect(result.hasMore).toBe(true);
		expect(result.nextCursor).toEqual(expect.any(String));
	});

	it("returns a complete SCAN batch without serializing keys into the cursor", async () => {
		mockClient.scanBuffer.mockResolvedValue([
			Buffer.from("42"),
			[Buffer.from("one"), Buffer.from("two"), Buffer.from("three")],
		]);
		mockPipeline.exec.mockResolvedValue([
			[null, "string"], [null, -1], [null, 10],
			[null, "string"], [null, -1], [null, 10],
			[null, "string"], [null, -1], [null, 10],
		]);

		const first = await adapter.scanKeys({ db: "0", limit: 2, exactPattern: false });

		expect(first.keys.map((item) => item.key.utf8)).toEqual(["one", "two", "three"]);
		expect(first.hasMore).toBe(true);
		expect(JSON.parse(Buffer.from(first.nextCursor ?? "", "base64url").toString())).toEqual({
			scanCursor: "42",
			exactPattern: false,
		});
		expect(mockClient.scanBuffer).toHaveBeenCalledTimes(1);
		expect(mockClient.scanBuffer).toHaveBeenCalledWith(
			"0",
			"MATCH",
			"*",
			"COUNT",
			2,
		);
	});

	it("represents infinite sorted-set scores without producing invalid JSON numbers", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("zset"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-zset"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(64);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.zcard.mockResolvedValue(2);
		mockClient.zscanBuffer.mockResolvedValue([
			Buffer.from("0"),
			[Buffer.from("minimum"), Buffer.from("-inf"), Buffer.from("maximum"), Buffer.from("inf")],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "c2NvcmVz",
			limit: 100,
			full: false,
			direction: "forward",
		});

		expect(result.value).toMatchObject({
			kind: "zset",
			entries: [{ score: "-inf" }, { score: "inf" }],
		});
		expect(JSON.stringify(result)).not.toContain('"score":null');
	});

	it("loads a bounded string value with a revision", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("string"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-value"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(96);
		mockClient.pttl.mockResolvedValue(3_600_000);
		mockClient.strlen.mockResolvedValue(6);
		mockClient.getrangeBuffer.mockResolvedValue(Buffer.from("active"));

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "c2Vzc2lvbjphYmM",
			limit: 100,
			full: false,
			direction: "forward",
		});

		expect(result).toMatchObject({
			key: { base64: "c2Vzc2lvbjphYmM", utf8: "session:abc" },
			type: "string",
			ttlMs: 3_600_000,
			memoryBytes: 96,
			length: 6,
			value: {
				kind: "string",
				value: { base64: "YWN0aXZl", utf8: "active" },
				truncated: false,
			},
			nextCursor: null,
			hasMore: false,
		});
		expect(result.revision).toMatch(/^[A-Za-z0-9_-]{40,}$/);
	});

	it("downloads an original string through bounded chunks", async () => {
		mockClient.callBuffer.mockResolvedValue(Buffer.from("string"));
		mockClient.strlen.mockResolvedValue(1_500_000);
		mockClient.getrangeBuffer.mockResolvedValue(Buffer.from([0, 255]));

		const result = await adapter.getStringChunk({
			db: "0",
			key: "YmluYXJ5",
			offset: 0,
			limit: 1_048_576,
		});

		expect(mockClient.getrangeBuffer).toHaveBeenCalledWith(
			Buffer.from("binary"),
			0,
			1_048_575,
		);
		expect(result).toEqual({
			chunk: { base64: "AP8" },
			length: 1_500_000,
			nextOffset: 2,
			hasMore: true,
		});
	});

	it("paginates binary hash fields", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("hash"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-hash"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(144);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.hlen.mockResolvedValue(2);
		mockClient.hscanBuffer.mockResolvedValue([
			Buffer.from("9"),
			[Buffer.from("name"), Buffer.from("alice"), Buffer.from([0xff]), Buffer.from([0x00])],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "cHJvZmlsZTox",
			limit: 2,
			full: false,
			direction: "forward",
		});

		expect(result.value).toEqual({
			kind: "hash",
			entries: [
				{
					field: { base64: "bmFtZQ", utf8: "name" },
					value: { base64: "YWxpY2U", utf8: "alice" },
				},
				{ field: { base64: "_w" }, value: { base64: "AA", utf8: "\u0000" } },
			],
		});
		expect(result.length).toBe(2);
		expect(result.hasMore).toBe(true);
		expect(result.nextCursor).toEqual(expect.any(String));
	});

	it("paginates list entries by stable indexes", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("list"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-list"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(null);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.llen.mockResolvedValue(3);
		mockClient.lrangeBuffer.mockResolvedValue([Buffer.from("one"), Buffer.from("two")]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "cXVldWU",
			limit: 2,
			full: false,
			direction: "forward",
		});

		expect(result.value).toEqual({
			kind: "list",
			entries: [
				{ index: 0, value: { base64: "b25l", utf8: "one" } },
				{ index: 1, value: { base64: "dHdv", utf8: "two" } },
			],
		});
		expect(result.hasMore).toBe(true);
	});

	it("paginates set members", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("set"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-set"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(88);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.scard.mockResolvedValue(2);
		mockClient.sscanBuffer.mockResolvedValue([
			Buffer.from("0"),
			[Buffer.from("blue"), Buffer.from("green")],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "dGFnczox",
			limit: 100,
			full: false,
			direction: "forward",
		});

		expect(result.value).toEqual({
			kind: "set",
			members: [
				{ base64: "Ymx1ZQ", utf8: "blue" },
				{ base64: "Z3JlZW4", utf8: "green" },
			],
		});
		expect(result.hasMore).toBe(false);
	});

	it("paginates sorted-set members with numeric scores", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("zset"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-zset"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(112);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.zcard.mockResolvedValue(2);
		mockClient.zscanBuffer.mockResolvedValue([
			Buffer.from("0"),
			[Buffer.from("alice"), Buffer.from("125.5"), Buffer.from("bob"), Buffer.from("98")],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "bGVhZGVyYm9hcmQ",
			limit: 100,
			full: false,
			direction: "forward",
		});

		expect(result.value).toEqual({
			kind: "zset",
			entries: [
				{ member: { base64: "YWxpY2U", utf8: "alice" }, score: 125.5 },
				{ member: { base64: "Ym9i", utf8: "bob" }, score: 98 },
			],
		});
	});

	it("paginates stream entries and fields", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("stream"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-stream"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(180);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.xlen.mockResolvedValue(1);
		mockClient.xrangeBuffer.mockResolvedValue([
			[Buffer.from("1700000000-0"), [Buffer.from("user"), Buffer.from("alice")]],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "ZXZlbnRz",
			limit: 100,
			full: false,
			direction: "forward",
		});

		expect(result.value).toEqual({
			kind: "stream",
			entries: [
				{
					id: "1700000000-0",
					fields: [
						{
							field: { base64: "dXNlcg", utf8: "user" },
							value: { base64: "YWxpY2U", utf8: "alice" },
						},
					],
				},
			],
		});
	});

	it("reads streams newest-first with reverse pagination", async () => {
		mockClient.callBuffer.mockImplementation((command: string) => {
			if (command === "TYPE") return Promise.resolve(Buffer.from("stream"));
			if (command === "DUMP") return Promise.resolve(Buffer.from("serialized-stream"));
			return Promise.resolve(null);
		});
		mockClient.call.mockResolvedValue(180);
		mockClient.pttl.mockResolvedValue(-1);
		mockClient.xlen.mockResolvedValue(1);
		mockClient.xrevrangeBuffer.mockResolvedValue([
			[Buffer.from("1700000001-0"), [Buffer.from("event"), Buffer.from("latest")]],
		]);

		const result = await adapter.getKeyDetails({
			db: "0",
			key: "ZXZlbnRz",
			limit: 100,
			full: false,
			direction: "backward",
		});

		expect(mockClient.xrevrangeBuffer).toHaveBeenCalledWith(
			Buffer.from("events"),
			"+",
			"-",
			"COUNT",
			101,
		);
		expect(result.value).toMatchObject({
			kind: "stream",
			entries: [{ id: "1700000001-0" }],
		});
	});
});
