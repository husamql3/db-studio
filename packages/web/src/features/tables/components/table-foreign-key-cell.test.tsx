import type { Cell, Table } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableRecord } from "@/features/tables/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableForeignKeyCell } from "./table-cell-variant";

const row = { id: 1, user_id: 7 };

const renderForeignKeyCell = () => {
	const cell = {
		id: "1_user_id",
		getValue: () => row.user_id,
		row: { id: "1", original: row },
		column: {
			id: "user_id",
			columnDef: { meta: { variant: "number", isForeignKey: true, referencedTable: "users" } },
		},
	} as Cell<TableRecord, unknown>;

	const table = { options: { meta: {} } } as Table<TableRecord>;

	render(
		<TableForeignKeyCell
			cell={cell}
			table={table}
			rowIndex={0}
			columnId="user_id"
			isEditing
			isFocused
			isSelected={false}
		/>,
	);
};

const getUpdate = () => useUpdateCellStore.getState().getUpdate(row, "user_id");

describe("TableForeignKeyCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
	});

	it("offers no empty string on a number column", async () => {
		renderForeignKeyCell();

		await screen.findByRole("textbox");

		expect(screen.queryByRole("button", { name: "Set empty string" })).toBeNull();
	});

	it("drops the typed value when Cancel is clicked", async () => {
		renderForeignKeyCell();

		await userEvent.type(await screen.findByRole("textbox"), "9");
		await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(getUpdate()).toBeNull();
	});

	it("stages the typed value when Save is clicked", async () => {
		renderForeignKeyCell();

		await userEvent.type(await screen.findByRole("textbox"), "9");
		await userEvent.click(screen.getByRole("button", { name: /save/i }));

		expect(getUpdate()?.newValue).toBe("79");
	});
});
