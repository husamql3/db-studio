import { describe, expect, it } from "vitest";
import { diffTableRows, getRecordKey } from "./table-diff";

// getRecordKey names a row across polls. Failure modes: two rows get one key (a composite key
// part dropped, or joined so "a::b"+"c" equals "a"+"b::c"), or one row gets two keys because a
// non-key column changed.
describe("getRecordKey", () => {
	it("keeps a row's key when its other columns change", () => {
		expect(getRecordKey({ email: "a@x.io", name: "Alice" }, ["email"])).toBe(
			getRecordKey({ email: "a@x.io", name: "Alicia" }, ["email"]),
		);
		expect(getRecordKey({ id: 42, title: "Item" })).toBe(
			getRecordKey({ id: 42, title: "New" }),
		);
		expect(getRecordKey({ _id: "m-1", name: "Doc" })).toBe(
			getRecordKey({ _id: "m-1", name: "Changed" }),
		);
	});

	it("tells apart rows that differ in any column of a composite key", () => {
		const pk = ["orgId", "userId"];
		expect(getRecordKey({ orgId: "org-1", userId: "usr-2" }, pk)).not.toBe(
			getRecordKey({ orgId: "org-1", userId: "usr-3" }, pk),
		);
	});

	it("distinguishes composite keys containing delimiter characters", () => {
		const pk = ["part1", "part2"];
		expect(getRecordKey({ part1: "a::b", part2: "c" }, pk)).not.toBe(
			getRecordKey({ part1: "a", part2: "b::c" }, pk),
		);
	});

	it("tells apart a key of 1 and a key of '1'", () => {
		expect(getRecordKey({ _id: 1 })).not.toBe(getRecordKey({ _id: "1" }));
	});

	it("tells apart keyless rows by their content", () => {
		expect(getRecordKey({ key: "a" })).not.toBe(getRecordKey({ key: "b" }));
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
