import { beforeEach, describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { AdapterRegistry } from "@/adapters/adapter.registry.js";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";

const stubAdapter = () => ({}) as unknown as IDbAdapter;

describe("AdapterRegistry", () => {
	let registry: AdapterRegistry;

	beforeEach(() => {
		registry = new AdapterRegistry();
	});

	it("get() returns the registered adapter", () => {
		const adapter = stubAdapter();
		registry.register("pg", adapter);
		expect(registry.get("pg")).toBe(adapter);
	});

	it("get() throws HTTPException(400) for unknown type", () => {
		let thrown: unknown;
		try {
			registry.get("pg");
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(HTTPException);
		expect((thrown as HTTPException).status).toBe(400);
	});

	it("register() overwrites an existing registration", () => {
		const first = stubAdapter();
		const second = stubAdapter();
		registry.register("pg", first);
		registry.register("pg", second);
		expect(registry.get("pg")).toBe(second);
	});

	it("has() returns false for unregistered type", () => {
		expect(registry.has("pg")).toBe(false);
	});

	it("has() returns true after registration", () => {
		registry.register("pg", stubAdapter());
		expect(registry.has("pg")).toBe(true);
	});

	it("getSupportedTypes() reflects all registered types", () => {
		registry.register("pg", stubAdapter());
		registry.register("mysql", stubAdapter());
		const types = registry.getSupportedTypes();
		expect(types).toContain("pg");
		expect(types).toContain("mysql");
		expect(types).toHaveLength(2);
	});
});
