import { describe, expect, it } from "vitest";
import { formatCellValue } from "./format-cell-value";

describe("formatCellValue", () => {
	describe("nullish values", () => {
		it("should render null as an empty string", () => {
			expect(formatCellValue(null)).toBe("");
		});

		it("should render undefined as an empty string", () => {
			expect(formatCellValue(undefined)).toBe("");
		});
	});

	describe("primitives", () => {
		it("should render a string unchanged", () => {
			expect(formatCellValue("hello")).toBe("hello");
		});

		it("should render an empty string as an empty string", () => {
			expect(formatCellValue("")).toBe("");
		});

		it("should render integers", () => {
			expect(formatCellValue(42)).toBe("42");
		});

		it("should render floats", () => {
			expect(formatCellValue(9.99)).toBe("9.99");
		});

		it("should render zero (not treated as nullish)", () => {
			expect(formatCellValue(0)).toBe("0");
		});

		it("should render booleans", () => {
			expect(formatCellValue(true)).toBe("true");
			expect(formatCellValue(false)).toBe("false");
		});

		it("should render bigint", () => {
			expect(formatCellValue(123n)).toBe("123");
		});
	});

	describe("objects and arrays", () => {
		it("should JSON-stringify a plain object", () => {
			expect(formatCellValue({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
		});

		it("should JSON-stringify an array", () => {
			expect(formatCellValue([1, 2, 3])).toBe("[1,2,3]");
		});

		it("should JSON-stringify a nested object", () => {
			expect(formatCellValue({ meta: { role: "admin" } })).toBe('{"meta":{"role":"admin"}}');
		});

		it("should render an empty object", () => {
			expect(formatCellValue({})).toBe("{}");
		});

		it("should fall back to String() when JSON.stringify throws (circular ref)", () => {
			// A circular reference makes JSON.stringify throw; the catch branch
			// falls back to String(value), which for a plain object is
			// "[object Object]". This is the money-path guard that keeps a cell
			// from crashing the render on unserializable data.
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			expect(formatCellValue(circular)).toBe("[object Object]");
		});
	});
});
