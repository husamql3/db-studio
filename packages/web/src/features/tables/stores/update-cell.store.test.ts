import { beforeEach, describe, expect, it } from "vitest";
import type { EditScope } from "@/types/table.type";
import { useUpdateCellStore } from "./update-cell.store";

// Failure modes:
// - two rows sharing `id` but differing in another key column collapse into one draft
// - MongoDB rows whose `_id` values differ only in type (1 vs "1") share one draft
// - a draft made in one table is saved against whichever table is open
// - a successful save drops a draft made in another table, or one re-edited mid-save

const members: EditScope = {
	id: JSON.stringify(["shop", "public", "members"]),
	keyColumns: ["tenant_id", "id"],
};
const orders: EditScope = {
	id: JSON.stringify(["shop", "public", "orders"]),
	keyColumns: ["id"],
};
const store = () => useUpdateCellStore.getState();

describe("useUpdateCellStore", () => {
	beforeEach(() => store().clearUpdates());

	it("keeps one draft per composite key", () => {
		const first = { tenant_id: 1, id: 7, name: "Ada" };
		const second = { tenant_id: 2, id: 7, name: "Ada" };
		store().setUpdate(first, "name", "Grace", "Ada", members);
		store().setUpdate(second, "name", "Linus", "Ada", members);

		expect(store().getUpdate(first, "name", members)?.newValue).toBe("Grace");
		expect(store().getUpdate(second, "name", members)?.newValue).toBe("Linus");
	});

	it("keeps one draft per key value type", () => {
		const collection: EditScope = { id: "mongo", keyColumns: ["_id"] };
		const numeric = { _id: 1, name: "Ada" };
		const text = { _id: "1", name: "Ada" };
		store().setUpdate(numeric, "name", "Grace", "Ada", collection);
		store().setUpdate(text, "name", "Linus", "Ada", collection);

		expect(store().getUpdate(numeric, "name", collection)?.newValue).toBe("Grace");
		expect(store().getUpdate(text, "name", collection)?.newValue).toBe("Linus");
	});

	it("returns and counts only the drafts of the requested table", () => {
		const row = { tenant_id: 1, id: 7, name: "Ada" };
		store().setUpdate(row, "name", "Grace", "Ada", members);
		store().setUpdate({ id: 7, name: "Ada" }, "name", "Linus", "Ada", orders);

		expect(
			store()
				.getUpdates(orders.id)
				.map((u) => u.newValue),
		).toEqual(["Linus"]);
		expect(store().getUpdateCount(members.id)).toBe(1);
	});

	it("removes only the drafts that were submitted", () => {
		const row = { id: 7, name: "Ada", note: "x" };
		store().setUpdate(row, "name", "Grace", "Ada", orders);
		store().setUpdate({ tenant_id: 1, id: 7, name: "Ada" }, "name", "Linus", "Ada", members);
		const submitted = store().getUpdates(orders.id);
		store().setUpdate(row, "note", "y", "x", orders);

		store().removeUpdates(submitted);

		expect(
			store()
				.getUpdates(orders.id)
				.map((u) => u.columnName),
		).toEqual(["note"]);
		expect(store().getUpdateCount(members.id)).toBe(1);
	});
});
