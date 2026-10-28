import { describe, expect, it } from "vitest";
import { formatCellValue } from "./format-cell-value";

describe("formatCellValue", () => {
	it("renders nullish values as an empty string", () => {
		expect(formatCellValue(null)).toBe("");
		expect(formatCellValue(undefined)).toBe("");
	});

	it("renders falsy-but-present values instead of blanking them", () => {
		expect(formatCellValue(0)).toBe("0");
		expect(formatCellValue(false)).toBe("false");
		expect(formatCellValue("")).toBe("");
	});

	it("renders a bigint without losing precision to Number", () => {
		expect(formatCellValue(9007199254740993n)).toBe("9007199254740993");
	});

	it("JSON-stringifies objects and arrays rather than showing [object Object]", () => {
		expect(formatCellValue({ meta: { role: "admin" } })).toBe('{"meta":{"role":"admin"}}');
		expect(formatCellValue([1, 2, 3])).toBe("[1,2,3]");
	});

	it("falls back to String() when JSON.stringify throws (circular ref)", () => {
		// A circular reference makes JSON.stringify throw; the catch branch
		// falls back to String(value). This is the guard that keeps a cell
		// from crashing the render on unserializable data.
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(formatCellValue(circular)).toBe("[object Object]");
	});
});
