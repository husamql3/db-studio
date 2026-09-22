import type { Cell, Table } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableRecord } from "@/types/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableJsonCell } from "./table-cell-variant";

vi.mock("./json-editor", () => ({
	JsonEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
		<textarea
			aria-label="json editor"
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));

const rowData = { id: 1, metadata: { status: 200 } };

const renderJsonCell = () => {
	const cell = {
		id: "1_metadata",
		getValue: () => rowData.metadata,
		row: { id: "1", original: rowData },
		column: { id: "metadata" },
	} as unknown as Cell<TableRecord, unknown>;
	const table = { options: { meta: {} } } as unknown as Table<TableRecord>;

	return render(
		<TableJsonCell
			cell={cell}
			table={table}
			rowIndex={0}
			columnId="metadata"
			isEditing
			isFocused
			isSelected={false}
		/>,
	);
};

const getUpdate = () => useUpdateCellStore.getState().getUpdate(rowData, "metadata");

describe("TableJsonCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
	});

	it("does not mark the cell dirty when saving an untouched value", () => {
		renderJsonCell();

		fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

		expect(getUpdate()).toBeNull();
	});

	it("records the parsed value when saving an edited value", () => {
		renderJsonCell();

		fireEvent.change(screen.getByLabelText("json editor"), {
			target: { value: '{"status": 404}' },
		});
		fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

		expect(getUpdate()?.newValue).toEqual({ status: 404 });
	});

	it("blocks saving invalid JSON and explains why", () => {
		renderJsonCell();

		fireEvent.change(screen.getByLabelText("json editor"), {
			target: { value: "{oops" },
		});

		const saveButton = screen.getByRole("button", { name: /save changes/i });
		expect(saveButton).toBeDisabled();
		expect(screen.getByText(/JSON/i)).toBeInTheDocument();

		fireEvent.click(saveButton);
		expect(getUpdate()).toBeNull();
	});
});
