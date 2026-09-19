import { beforeEach, describe, expect, it } from "vitest";
import { useRowDetailsStore } from "./row-details.store";

const state = () => useRowDetailsStore.getState();

beforeEach(() => {
	useRowDetailsStore.setState({ tableName: null, rowIndex: null });
});

describe("useRowDetailsStore", () => {
	it("starts with no selection", () => {
		expect(state().tableName).toBeNull();
		expect(state().rowIndex).toBeNull();
	});

	it("stores the selected table and row", () => {
		state().setRowDetails("users", 2);
		expect(state().tableName).toBe("users");
		expect(state().rowIndex).toBe(2);
	});

	it("moves the selection without changing the table", () => {
		state().setRowDetails("users", 0);
		state().selectRowDetails(4);
		expect(state().tableName).toBe("users");
		expect(state().rowIndex).toBe(4);
	});

	it("clears the selection", () => {
		state().setRowDetails("users", 1);
		state().clearRowDetails();
		expect(state().tableName).toBeNull();
		expect(state().rowIndex).toBeNull();
	});
});
