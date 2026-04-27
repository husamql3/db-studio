import { describe, it, expect, beforeEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import { AdapterRegistry, getAdapter } from "@/adapters/adapter.registry.js";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";

const makeStub = () => ({}) as unknown as IDbAdapter;

describe("AdapterRegistry", () => {
	let registry: AdapterRegistry;

	beforeEach(() => {
		registry = new AdapterRegistry();
	});

	describe("register()", () => {
		it("registers an adapter for a given db type", () => {
			const stub = makeStub();
			registry.register("pg", stub);
			expect(registry.get("pg")).toBe(stub);
		});

		it("overwrites an existing registration", () => {
			const first = makeStub();
			const second = makeStub();
			registry.register("pg", first);
			registry.register("pg", second);
			expect(registry.get("pg")).toBe(second);
		});

		it("registers adapters for all supported db types independently", () => {
			const pg = makeStub();
			const mysql = makeStub();
			const mssql = makeStub();
			const mongo = makeStub();
			registry.register("pg", pg);
			registry.register("mysql", mysql);
			registry.register("mssql", mssql);
			registry.register("mongodb", mongo);
			expect(registry.get("pg")).toBe(pg);
			expect(registry.get("mysql")).toBe(mysql);
			expect(registry.get("mssql")).toBe(mssql);
			expect(registry.get("mongodb")).toBe(mongo);
		});
	});

	describe("get()", () => {
		it("returns the registered adapter", () => {
			const stub = makeStub();
			registry.register("mysql", stub);
			expect(registry.get("mysql")).toBe(stub);
		});

		it("throws HTTPException(400) for an unregistered type", () => {
			expect(() => registry.get("pg")).toThrow(HTTPException);
			expect(() => registry.get("pg")).toThrow(
				expect.objectContaining({ status: 400 }),
			);
		});

		it("error message lists the supported types", () => {
			registry.register("pg", makeStub());
			registry.register("mysql", makeStub());
			try {
				registry.get("mssql");
			} catch (e) {
				const ex = e as HTTPException;
				expect(ex.message).toContain("pg");
				expect(ex.message).toContain("mysql");
			}
		});

		it("error message includes the requested type", () => {
			try {
				registry.get("mongodb");
			} catch (e) {
				const ex = e as HTTPException;
				expect(ex.message).toContain("mongodb");
			}
		});
	});

	describe("has()", () => {
		it("returns true for a registered type", () => {
			registry.register("pg", makeStub());
			expect(registry.has("pg")).toBe(true);
		});

		it("returns false for an unregistered type", () => {
			expect(registry.has("pg")).toBe(false);
		});

		it("returns false after registry is created but before any registrations", () => {
			expect(registry.has("mysql")).toBe(false);
			expect(registry.has("mssql")).toBe(false);
			expect(registry.has("mongodb")).toBe(false);
		});

		it("reflects registration immediately", () => {
			expect(registry.has("pg")).toBe(false);
			registry.register("pg", makeStub());
			expect(registry.has("pg")).toBe(true);
		});
	});

	describe("getSupportedTypes()", () => {
		it("returns empty array when nothing is registered", () => {
			expect(registry.getSupportedTypes()).toEqual([]);
		});

		it("returns all registered types", () => {
			registry.register("pg", makeStub());
			registry.register("mysql", makeStub());
			expect(registry.getSupportedTypes()).toEqual(
				expect.arrayContaining(["pg", "mysql"]),
			);
			expect(registry.getSupportedTypes()).toHaveLength(2);
		});

		it("reflects overwritten registrations without duplicates", () => {
			registry.register("pg", makeStub());
			registry.register("pg", makeStub());
			expect(registry.getSupportedTypes()).toHaveLength(1);
			expect(registry.getSupportedTypes()).toContain("pg");
		});
	});

	describe("instance isolation", () => {
		it("two registry instances do not share state", () => {
			const a = new AdapterRegistry();
			const b = new AdapterRegistry();
			a.register("pg", makeStub());
			expect(a.has("pg")).toBe(true);
			expect(b.has("pg")).toBe(false);
		});
	});
});

describe("getAdapter()", () => {
	it("throws for an unregistered type (singleton registry is empty in tests)", () => {
		expect(() => getAdapter("pg")).toThrow(HTTPException);
	});
});
