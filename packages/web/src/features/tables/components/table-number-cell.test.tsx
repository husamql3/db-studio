import type { Cell, Table } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableRecord } from "@/features/tables/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableNumberCell } from "./table-cell-variant";

const cellFor = (row: TableRecord, isNullable: boolean) =>
	({
		id: "1_qty",
		getValue: () => row.qty,
		row: { id: "1", original: row },
		column: { id: "qty", columnDef: { meta: { isNullable } } },
	}) as Cell<TableRecord, unknown>;

const table = { options: { meta: {} } } as Table<TableRecord>;

const numberCell = (row: TableRecord, isEditing = false, isNullable = true) => (
	<TableNumberCell
		cell={cellFor(row, isNullable)}
		table={table}
		rowIndex={0}
		columnId="qty"
		isEditing={isEditing}
		isFocused={false}
		isSelected={false}
	/>
);

const staged = (row: TableRecord) =>
	useUpdateCellStore.getState().getUpdate(row, "qty")?.newValue;

describe("TableNumberCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
	});

	it("shows a refetched value that changed on the server", () => {
		const { rerender } = render(numberCell({ id: 1, qty: 8 }));

		rerender(numberCell({ id: 1, qty: 42 }));

		expect(screen.getByRole("button")).toHaveTextContent("42");
	});

	it("keeps an unsaved edit when the row is refetched", () => {
		const { rerender } = render(numberCell({ id: 1, qty: 8 }, true));
		fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });

		rerender(numberCell({ id: 1, qty: 42 }, true));
		expect(screen.getByRole("spinbutton")).toHaveValue(15);

		fireEvent.blur(screen.getByRole("spinbutton"));
		rerender(numberCell({ id: 1, qty: 42 }));
		expect(screen.getByRole("button")).toHaveTextContent("15");
	});

	it("stages the typed digits of a big integer exactly", () => {
		const row = { id: 1, qty: "12345678901234567890" };
		render(numberCell(row, true));
		const input = screen.getByRole("spinbutton");

		fireEvent.change(input, { target: { value: "12345678901234567891" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(staged(row)).toBe("12345678901234567891");
	});

	it("stages NULL when a nullable number is cleared", () => {
		const row = { id: 1, qty: 8 };
		render(numberCell(row, true));
		const input = screen.getByRole("spinbutton");

		fireEvent.change(input, { target: { value: "" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(staged(row)).toBeNull();
	});

	it("keeps the value when a NOT NULL number is cleared", () => {
		const row = { id: 1, qty: 8 };
		render(numberCell(row, true, false));
		const input = screen.getByRole("spinbutton");

		fireEvent.change(input, { target: { value: "" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(useUpdateCellStore.getState().getUpdate(row, "qty")).toBeNull();
	});
});
