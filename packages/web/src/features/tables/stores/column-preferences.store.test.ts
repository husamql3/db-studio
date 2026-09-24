import { beforeEach, describe, expect, it } from "vitest";
import {
	applyColumnPrefs,
	getColumnPrefs,
	makeColumnPrefKey,
	reconcileColumnPrefs,
	reorderColumns,
	useColumnPreferencesStore,
} from "./column-preferences.store";

const parts = { dbType: "pg", database: "dbstudio", tableName: "users" };
const store = () => useColumnPreferencesStore.getState();

beforeEach(() => {
	useColumnPreferencesStore.setState({ prefsByTable: {} });
});

describe("column preferences store", () => {
	it("produces distinct keys when database or table names contain colons", () => {
		const keyA = makeColumnPrefKey({ dbType: "pg", database: "a:b", tableName: "c" });
		const keyB = makeColumnPrefKey({ dbType: "pg", database: "a", tableName: "b:c" });
		expect(keyA).not.toBe(keyB);
	});

	it("sanitizes corrupt or partial payloads on write", () => {
		store().setColumnPrefs(parts, {
			order: ["a", 42, null],
			hidden: "oops",
		} as never);
		expect(getColumnPrefs(parts)).toEqual({ order: ["a"], hidden: [] });
	});

	it("discards a persisted payload that is not an object", () => {
		window.localStorage.setItem(
			"dbstudio-column-preferences",
			JSON.stringify({ state: { prefsByTable: "corrupt" }, version: 0 }),
		);

		useColumnPreferencesStore.persist.rehydrate();

		expect(useColumnPreferencesStore.getState().prefsByTable).toEqual({});
		expect(getColumnPrefs(parts)).toEqual({ order: [], hidden: [] });
	});

	it("sanitizes each table entry when rehydrating persisted preferences", () => {
		window.localStorage.setItem(
			"dbstudio-column-preferences",
			JSON.stringify({
				state: {
					prefsByTable: {
						[makeColumnPrefKey(parts)]: { order: ["a", 7, null], hidden: "nope" },
					},
				},
				version: 0,
			}),
		);

		useColumnPreferencesStore.persist.rehydrate();

		expect(getColumnPrefs(parts)).toEqual({ order: ["a"], hidden: [] });
	});
});

describe("reconcileColumnPrefs", () => {
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
