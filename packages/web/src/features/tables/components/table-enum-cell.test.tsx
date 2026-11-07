import type { Cell, Table } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TableRecord } from "@/features/tables/table.type";
import { TableEnumCell } from "./table-cell-variant";

const renderEnumCell = (isNullable: boolean) => {
	const row = { id: 1, status: "open" };

	const cell = {
		id: "1_status",
		getValue: () => row.status,
		row: { id: "1", original: row },
		column: {
			id: "status",
			columnDef: { meta: { enumValues: ["open", "closed"], isNullable } },
		},
	} as Cell<TableRecord, unknown>;

	const table = { options: { meta: {} } } as Table<TableRecord>;

	render(
		<TableEnumCell
			cell={cell}
			table={table}
			rowIndex={0}
			columnId="status"
			isEditing
			isFocused
			isSelected={false}
		/>,
	);
};

describe("TableEnumCell", () => {
	it("offers no NULL for a NOT NULL column", () => {
		renderEnumCell(false);

		expect(screen.getByRole("option", { name: "closed" })).toBeInTheDocument();
		expect(screen.queryByRole("option", { name: "NULL" })).toBeNull();
	});

	it("offers NULL for a nullable column", () => {
		renderEnumCell(true);

		expect(screen.getByRole("option", { name: "NULL" })).toBeInTheDocument();
	});
});
