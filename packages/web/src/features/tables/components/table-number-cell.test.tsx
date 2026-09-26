import type { Cell, Table } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableRecord } from "@/types/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableNumberCell } from "./table-cell-variant";

const cellFor = (row: TableRecord) =>
	({
		id: "1_qty",
		getValue: () => row.qty,
		row: { id: "1", original: row },
		column: { id: "qty" },
	}) as unknown as Cell<TableRecord, unknown>;

const table = { options: { meta: {} } } as unknown as Table<TableRecord>;

const numberCell = (row: TableRecord) => (
	<TableNumberCell
		cell={cellFor(row)}
		table={table}
		rowIndex={0}
		columnId="qty"
		isEditing={false}
		isFocused={false}
		isSelected={false}
	/>
);

describe("TableNumberCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
	});

	it("shows a refetched value that changed on the server", () => {
		const { rerender } = render(numberCell({ id: 1, qty: 8 }));

		rerender(numberCell({ id: 1, qty: 42 }));

		expect(screen.getByRole("spinbutton")).toHaveValue(42);
	});

	it("keeps an unsaved edit when the row is refetched", () => {
		const { rerender } = render(numberCell({ id: 1, qty: 8 }));
		fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });

		rerender(numberCell({ id: 1, qty: 42 }));

		expect(screen.getByRole("spinbutton")).toHaveValue(15);
	});
});
