import { afterEach, describe, expect, it } from "vitest";
import {
	applyColumnPrefs,
	clearColumnPrefs,
	clearMemoryFallback,
	loadColumnPrefs,
	makeStorageKey,
	reconcileColumnPrefs,
	reorderColumns,
	sameColumnPrefKey,
	saveColumnPrefs,
	subscribeColumnPrefsChanged,
} from "./column-preferences.store";

const parts = { dbType: "pg", database: "dbstudio", tableName: "users" };

afterEach(() => {
	clearColumnPrefs(parts);
	clearMemoryFallback();
});

describe("load/save", () => {
	it("round-trips preferences through localStorage", () => {
		expect(loadColumnPrefs(parts)).toEqual({ order: [], hidden: [] });
		saveColumnPrefs(parts, { order: ["b", "a"], hidden: ["b"] });
		expect(loadColumnPrefs(parts)).toEqual({ order: ["b", "a"], hidden: ["b"] });
	});

	it("produces distinct storage keys when database or table names contain colons", () => {
		const keyA = makeStorageKey({ dbType: "pg", database: "a:b", tableName: "c" });
		const keyB = makeStorageKey({ dbType: "pg", database: "a", tableName: "b:c" });
		expect(keyA).not.toBe(keyB);
	});

	it("keeps preferences isolated between tables and databases", () => {
		saveColumnPrefs(parts, { order: ["a"], hidden: [] });
		const otherTable = { ...parts, tableName: "orders" };
		expect(loadColumnPrefs(otherTable)).toEqual({ order: [], hidden: [] });
		saveColumnPrefs(otherTable, { order: [], hidden: ["x"] });
		expect(loadColumnPrefs(parts)).toEqual({ order: ["a"], hidden: [] });
		const otherDb = { ...parts, database: "otherdb" };
		expect(loadColumnPrefs(otherDb)).toEqual({ order: [], hidden: [] });
	});

	it("sanitizes corrupt or partial payloads", () => {
		window.localStorage.setItem(makeStorageKey(parts), "not json at all");
		expect(loadColumnPrefs(parts)).toEqual({ order: [], hidden: [] });
		window.localStorage.setItem(
			makeStorageKey(parts),
			JSON.stringify({ order: ["a", 42, null], hidden: "oops", extra: true }),
		);
		expect(loadColumnPrefs(parts)).toEqual({ order: ["a"], hidden: [] });
	});

	it("synchronizes preferences via in-memory fallback when storage setItem throws", () => {
		const throwingStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {},
		};

		saveColumnPrefs(parts, { order: ["col2", "col1"], hidden: ["col2"] }, throwingStorage);

		expect(loadColumnPrefs(parts, throwingStorage)).toEqual({
			order: ["col2", "col1"],
			hidden: ["col2"],
		});
	});

	it("notifies listeners and clears in-memory fallback when removeItem throws", () => {
		let notified = false;
		const unsubscribe = subscribeColumnPrefsChanged((changed) => {
			if (sameColumnPrefKey(changed, parts)) notified = true;
		});

		const failingStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error("fail");
			},
			removeItem: () => {
				throw new Error("fail");
			},
		};

		saveColumnPrefs(parts, { order: ["a"], hidden: [] }, failingStorage);
		expect(loadColumnPrefs(parts, failingStorage)).toEqual({ order: ["a"], hidden: [] });

		notified = false;
		clearColumnPrefs(parts, failingStorage);
		expect(notified).toBe(true);
		expect(loadColumnPrefs(parts, failingStorage)).toEqual({ order: [], hidden: [] });

		unsubscribe();
	});
});

describe("reconcileColumnPrefs", () => {
	it("passes through when prefs are empty", () => {
		expect(reconcileColumnPrefs(["a", "b"], { order: [], hidden: [] })).toEqual({
			order: ["a", "b"],
			hidden: [],
		});
	});

	it("keeps saved order for known columns and appends new ones", () => {
		expect(reconcileColumnPrefs(["a", "b", "c"], { order: ["c", "a"], hidden: [] })).toEqual({
			order: ["c", "a", "b"],
			hidden: [],
		});
	});

	it("discards removed columns from order and hidden", () => {
		expect(
			reconcileColumnPrefs(["a"], {
				order: ["a", "gone"],
				hidden: ["gone", "a"],
			}),
		).toEqual({ order: ["a"], hidden: ["a"] });
	});

	it("drops duplicate entries from saved order", () => {
		expect(reconcileColumnPrefs(["a", "b"], { order: ["a", "a", "b"], hidden: [] })).toEqual({
			order: ["a", "b"],
			hidden: [],
		});
	});

	it("ignores hidden entries that are not schema columns", () => {
		expect(reconcileColumnPrefs(["a", "b"], { order: [], hidden: ["a", "ghost"] })).toEqual({
			order: ["a", "b"],
			hidden: ["a"],
		});
	});
});

describe("applyColumnPrefs", () => {
	it("returns schema order when nothing is saved", () => {
		expect(applyColumnPrefs(["a", "b", "c"], { order: [], hidden: [] })).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("applies saved order and drops hidden columns", () => {
		expect(
			applyColumnPrefs(["a", "b", "c"], {
				order: ["c", "b", "a"],
				hidden: ["b"],
			}),
		).toEqual(["c", "a"]);
	});

	it("appends newly discovered columns after the saved order", () => {
		expect(applyColumnPrefs(["a", "b", "new"], { order: ["b", "a"], hidden: [] })).toEqual([
			"b",
			"a",
			"new",
		]);
	});
});

describe("reorderColumns", () => {
	it("moves a column downwards after the target", () => {
		expect(reorderColumns(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
	});

	it("moves a column upwards before the target", () => {
		expect(reorderColumns(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
	});

	it("respects explicit before/after position", () => {
		expect(reorderColumns(["a", "b", "c"], "a", "b", "before")).toEqual(["a", "b", "c"]);
		expect(reorderColumns(["a", "b", "c"], "c", "b", "after")).toEqual(["a", "b", "c"]);
	});

	it("returns unchanged order if source equals target or column missing", () => {
		expect(reorderColumns(["a", "b"], "a", "a")).toEqual(["a", "b"]);
		expect(reorderColumns(["a", "b"], "x", "a")).toEqual(["a", "b"]);
		expect(reorderColumns(["a", "b"], "a", "x")).toEqual(["a", "b"]);
	});
});
