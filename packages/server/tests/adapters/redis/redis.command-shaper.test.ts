import { describe, expect, it } from "vitest";
import { tokenizeCommand } from "@/adapters/redis/redis.command-shaper.js";

describe("tokenizeCommand", () => {
	it("splits whitespace-separated tokens", () => {
		expect(tokenizeCommand("GET foo")).toEqual(["GET", "foo"]);
	});

	it("preserves double-quoted strings", () => {
		expect(tokenizeCommand('SET foo "hello world"')).toEqual(["SET", "foo", "hello world"]);
	});

	it("preserves single-quoted strings", () => {
		expect(tokenizeCommand("HSET k field 'value with space'")).toEqual([
			"HSET",
			"k",
			"field",
			"value with space",
		]);
	});

	it("supports backslash-escapes inside double quotes", () => {
		expect(tokenizeCommand('SET k "she said \\"hi\\""')).toEqual([
			"SET",
			"k",
			'she said "hi"',
		]);
	});

	it("throws on unterminated quotes", () => {
		expect(() => tokenizeCommand('SET k "open')).toThrow();
	});
});
