import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
	defaultStorage: {
		unlockable: true,
		load: vi.fn(),
		save: vi.fn(),
		clear: vi.fn(),
	},
	memoryStorage: {
		unlockable: false,
		load: vi.fn(),
		save: vi.fn(),
		clear: vi.fn(),
	},
}));

vi.mock("@tanstack/ai-client/byok", async (importOriginal) => {
	const original = await importOriginal<typeof import("@tanstack/ai-client/byok")>();
	return {
		...original,
		defaultByokStorage: () => storage.defaultStorage,
		memoryStorage: () => storage.memoryStorage,
	};
});

describe("AI key storage", () => {
	beforeEach(() => vi.clearAllMocks());

	it("keeps chat sends from blocking on an implicit passkey unlock", async () => {
		const { aiByok } = await import("./byok");

		expect(aiByok.storage.unlockable).toBe(false);
	});
});
