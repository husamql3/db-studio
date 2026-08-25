import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "@/utils/create-server.js";

const mockKeyValueAdapter = vi.hoisted(() => ({
	scanKeys: vi.fn(),
	getKeyDetails: vi.fn(),
	getStringChunk: vi.fn(),
	createKey: vi.fn(),
	applyKeyAction: vi.fn(),
	deleteKey: vi.fn(),
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
	getAdapter: vi.fn(() => mockKeyValueAdapter),
	getKeyValueAdapter: vi.fn(() => mockKeyValueAdapter),
	adapterRegistry: {
		register: vi.fn(),
		get: vi.fn(() => mockKeyValueAdapter),
		has: vi.fn(() => true),
		getSupportedTypes: vi.fn(() => ["redis"]),
	},
}));

vi.mock("@/db-manager.js", () => ({
	getDbType: vi.fn(() => "redis"),
}));

describe("Key browser routes", () => {
	let app: ReturnType<typeof createServer>["app"];

	beforeEach(() => {
		vi.clearAllMocks();
		app = createServer().app;
	});

	it("scans binary-safe key summaries", async () => {
		mockKeyValueAdapter.scanKeys.mockResolvedValue({
			keys: [
				{
					key: { base64: "dXNlcjox", utf8: "user:1" },
					type: "hash",
					ttlMs: 60_000,
					memoryBytes: 128,
				},
			],
			nextCursor: "eyJzY2FuQ3Vyc29yIjoiNDIifQ",
			hasMore: true,
		});

		const response = await app.request("/api/redis/keys?db=0&limit=50");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			data: {
				keys: [
					{
						key: { base64: "dXNlcjox", utf8: "user:1" },
						type: "hash",
						ttlMs: 60_000,
						memoryBytes: 128,
					},
				],
				nextCursor: "eyJzY2FuQ3Vyc29yIjoiNDIifQ",
				hasMore: true,
			},
		});
		expect(mockKeyValueAdapter.scanKeys).toHaveBeenCalledWith({
			db: "0",
			limit: 50,
			cursor: undefined,
			search: undefined,
			exactPattern: false,
			type: undefined,
		});
	});

	it("returns a bounded key detail page", async () => {
		mockKeyValueAdapter.getKeyDetails.mockResolvedValue({
			key: { base64: "c2Vzc2lvbjphYmM", utf8: "session:abc" },
			type: "string",
			ttlMs: 3_600_000,
			memoryBytes: 96,
			length: 6,
			revision: "revision-1",
			value: {
				kind: "string",
				value: { base64: "YWN0aXZl", utf8: "active" },
				truncated: false,
			},
			nextCursor: null,
			hasMore: false,
		});

		const response = await app.request(
			"/api/redis/keys/c2Vzc2lvbjphYmM?db=0&limit=100",
		);

		expect(response.status).toBe(200);
		expect((await response.json()).data).toMatchObject({
			type: "string",
			revision: "revision-1",
			value: { kind: "string", truncated: false },
		});
			expect(mockKeyValueAdapter.getKeyDetails).toHaveBeenCalledWith({
				db: "0",
				key: "c2Vzc2lvbjphYmM",
				cursor: undefined,
				full: false,
				direction: "forward",
				limit: 100,
		});
	});

	it("downloads string values in bounded binary chunks", async () => {
		mockKeyValueAdapter.getStringChunk.mockResolvedValue({
			chunk: { base64: "AP8", utf8: undefined },
			length: 2,
			nextOffset: null,
			hasMore: false,
		});
		const response = await app.request(
			"/api/redis/keys/YmluYXJ5/raw?db=0&offset=0&limit=1048576",
		);
		expect(response.status).toBe(200);
			expect(mockKeyValueAdapter.getStringChunk).toHaveBeenCalledWith({
				db: "0",
				key: "YmluYXJ5",
				offset: 0,
				limit: 1_048_576,
				expectedRevision: undefined,
			});
	});

	it("creates a key without overwriting an existing key", async () => {
		mockKeyValueAdapter.createKey.mockResolvedValue({
			key: { base64: "Z3JlZXRpbmc", utf8: "greeting" },
			revision: "revision-2",
			deleted: false,
		});

		const response = await app.request("/api/redis/keys?db=0", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: { base64: "Z3JlZXRpbmc", utf8: "greeting" },
				type: "string",
				value: { kind: "string", value: { base64: "aGVsbG8", utf8: "hello" } },
				ttlMs: null,
			}),
		});

		expect(response.status).toBe(200);
		expect((await response.json()).data.revision).toBe("revision-2");
		expect(mockKeyValueAdapter.createKey).toHaveBeenCalledWith({
			db: "0",
			key: { base64: "Z3JlZXRpbmc", utf8: "greeting" },
			type: "string",
			value: { kind: "string", value: { base64: "aGVsbG8", utf8: "hello" } },
			ttlMs: null,
		});
	});

	it("applies a revision-guarded granular key action", async () => {
		mockKeyValueAdapter.applyKeyAction.mockResolvedValue({
			key: { base64: "cHJvZmlsZTox", utf8: "profile:1" },
			revision: "revision-3",
			deleted: false,
		});
		const response = await app.request("/api/redis/keys/cHJvZmlsZTox/actions?db=0", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				expectedRevision: "revision-2",
				force: false,
				operation: {
					action: "upsertHash",
					field: { base64: "bmFtZQ", utf8: "name" },
					value: { base64: "YWxpY2U", utf8: "alice" },
				},
			}),
		});
		expect(response.status).toBe(200);
		expect(mockKeyValueAdapter.applyKeyAction).toHaveBeenCalledWith({
			db: "0",
			key: "cHJvZmlsZTox",
			expectedRevision: "revision-2",
			force: false,
			operation: {
				action: "upsertHash",
				field: { base64: "bmFtZQ", utf8: "name" },
				value: { base64: "YWxpY2U", utf8: "alice" },
			},
		});
	});

	it("deletes one key with a revision token", async () => {
		mockKeyValueAdapter.deleteKey.mockResolvedValue({ deleted: true });
		const response = await app.request(
			"/api/redis/keys/c2Vzc2lvbjphYmM?db=0&expectedRevision=revision-1&force=false",
			{ method: "DELETE" },
		);
		expect(response.status).toBe(200);
		expect(mockKeyValueAdapter.deleteKey).toHaveBeenCalledWith({
			db: "0",
			key: "c2Vzc2lvbjphYmM",
			expectedRevision: "revision-1",
			force: false,
		});
	});
});
