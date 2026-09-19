import { describe, expect, it } from "vitest";
import { diffTableRows, getRecordKey } from "./table-diff";

describe("getRecordKey", () => {
	it("uses primary key columns when provided", () => {
		const row = { id: 1, email: "alice@example.com", name: "Alice" };
		expect(getRecordKey(row, ["email"])).toBe("alice@example.com");
	});

	it("supports composite primary keys", () => {
		const row = { orgId: "org-1", userId: "usr-2", role: "admin" };
		expect(getRecordKey(row, ["orgId", "userId"])).toBe('["org-1","usr-2"]');
	});

	it("distinguishes composite keys containing delimiter characters", () => {
		const rowA = { part1: "a::b", part2: "c" };
		const rowB = { part1: "a", part2: "b::c" };
		expect(getRecordKey(rowA, ["part1", "part2"])).not.toBe(
			getRecordKey(rowB, ["part1", "part2"]),
		);
		expect(getRecordKey(rowA, ["part1", "part2"])).toBe('["a::b","c"]');
		expect(getRecordKey(rowB, ["part1", "part2"])).toBe('["a","b::c"]');
	});

	it("falls back to id when no primary key is specified", () => {
		const row = { id: 42, title: "Item" };
		expect(getRecordKey(row)).toBe("42");
	});

	it("falls back to _id when id is absent", () => {
		const row = { _id: "mongo-123", name: "Doc" };
		expect(getRecordKey(row)).toBe("mongo-123");
	});

	it("falls back to stableStringify when neither id nor _id is present", () => {
		const row = { key: "val" };
		expect(getRecordKey(row)).toBe('{"key":"val"}');
	});
});

describe("diffTableRows", () => {
	it("returns no changes when previous rows are undefined or null", () => {
		const result = diffTableRows(null, [{ id: 1, name: "Alice" }]);
		expect(result).toEqual({
			hasVisibleChanges: false,
			insertedRowIds: [],
			changedCellKeys: [],
		});
	});

	it("returns no changes when rows are identical", () => {
		const rows = [
			{ id: 1, name: "Alice", age: 30 },
			{ id: 2, name: "Bob", age: 25 },
		];
		const result = diffTableRows(rows, rows);
		expect(result.hasVisibleChanges).toBe(false);
		expect(result.insertedRowIds).toHaveLength(0);
		expect(result.changedCellKeys).toHaveLength(0);
	});

	it("detects newly inserted rows", () => {
		const prev = [{ id: 1, name: "Alice" }];
		const next = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		const result = diffTableRows(prev, next);
		expect(result.hasVisibleChanges).toBe(true);
		expect(result.insertedRowIds).toEqual(["2"]);
		expect(result.changedCellKeys).toHaveLength(0);
	});

	it("detects updated cells in existing rows", () => {
		const prev = [
			{ id: 1, name: "Alice", status: "offline" },
			{ id: 2, name: "Bob", status: "online" },
		];
		const next = [
			{ id: 1, name: "Alice", status: "online" },
			{ id: 2, name: "Bob", status: "online" },
		];
		const result = diffTableRows(prev, next);
		expect(result.hasVisibleChanges).toBe(true);
		expect(result.insertedRowIds).toHaveLength(0);
		expect(result.changedCellKeys).toEqual(["1:status"]);
	});

	it("detects deleted rows", () => {
		const prev = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		const next = [{ id: 1, name: "Alice" }];
		const result = diffTableRows(prev, next);
		expect(result.hasVisibleChanges).toBe(true);
		expect(result.insertedRowIds).toHaveLength(0);
	});

	it("detects reordered rows", () => {
		const prev = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		const next = [
			{ id: 2, name: "Bob" },
			{ id: 1, name: "Alice" },
		];
		const result = diffTableRows(prev, next);
		expect(result.hasVisibleChanges).toBe(true);
	});

	it("handles composite primary keys accurately", () => {
		const pk = ["dept", "empId"];
		const prev = [{ dept: "eng", empId: 10, title: "Junior" }];
		const next = [
			{ dept: "eng", empId: 10, title: "Senior" },
			{ dept: "sales", empId: 20, title: "Lead" },
		];
		const result = diffTableRows(prev, next, pk);
		expect(result.hasVisibleChanges).toBe(true);
		expect(result.insertedRowIds).toEqual(['["sales",20]']);
		expect(result.changedCellKeys).toEqual(['["eng",10]:title']);
	});
});
