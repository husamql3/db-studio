import type { Cell, Table } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableRecord } from "@/features/tables/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableTextCell } from "./table-cell-variant";

const row = { id: 1, name: "Ada" };

const renderTextCell = () => {
	const cell = {
		id: "1_name",
		getValue: () => row.name,
		row: { id: "1", original: row },
		column: { id: "name", columnDef: { meta: {} } },
	} as Cell<TableRecord, unknown>;

	const table = { options: { meta: {} } } as Table<TableRecord>;

	render(
		<TableTextCell
			cell={cell}
			table={table}
			rowIndex={0}
			columnId="name"
			isEditing
			isFocused
			isSelected={false}
		/>,
	);
};

describe("TableTextCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
	});

	it("leaves nothing to undo after Escape drops the typed text", async () => {
		renderTextCell();

		await userEvent.type(await screen.findByRole("textbox"), " Lovelace");
		await userEvent.keyboard("{Escape}");

		const store = useUpdateCellStore.getState();
		expect(store.getUpdate(row, "name")).toBeNull();
		expect(store.undo("global")).toBe(0);
		expect(useUpdateCellStore.getState().getUpdate(row, "name")).toBeNull();
	});
});
