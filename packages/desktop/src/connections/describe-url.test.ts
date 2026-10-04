import { describe, expect, it } from "vitest";
import { describeConnectionUrl } from "./describe-url";

describe("describeConnectionUrl", () => {
	it("strips credentials and maps the scheme to the server db type", () => {
		expect(
			describeConnectionUrl("postgresql://admin:s3cret@db.internal:5433/app?sslmode=require"),
		).toEqual({ dbType: "pg", summary: "db.internal:5433/app" });
		expect(describeConnectionUrl("mongodb+srv://u:p@cluster0.mongodb.net/shop")).toEqual({
			dbType: "mongodb",
			summary: "cluster0.mongodb.net/shop",
		});
		expect(describeConnectionUrl("rediss://:pw@cache.example.com")).toEqual({
			dbType: "redis",
			summary: "cache.example.com",
		});
	});

	it("keeps the file path for sqlite", () => {
		expect(describeConnectionUrl("sqlite://./data/app.db")).toEqual({
			dbType: "sqlite",
			summary: "./data/app.db",
		});
	});

	it("drops sqlite query parameters, which can carry secrets", () => {
		expect(describeConnectionUrl("sqlite://./app.db?password=s3cret#frag")).toEqual({
			dbType: "sqlite",
			summary: "./app.db",
		});
		expect(describeConnectionUrl("sqlite://?mode=memory")).toEqual({
			dbType: "sqlite",
			summary: "in-memory",
		});
	});

	it("rejects schemes the server does not support", () => {
		expect(() => describeConnectionUrl("http://example.com")).toThrow(/Unsupported/);
		expect(() => describeConnectionUrl("not a url")).toThrow(/Unsupported/);
		expect(() => describeConnectionUrl("postgres://")).toThrow(/missing a host|malformed/);
	});
});
