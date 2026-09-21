import type { Cell, Table } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableRecord } from "@/types/table.type";
import { useLiveModeStore } from "../stores/live-mode.store";
import { TableCellWrapper } from "./table-cell-wrapper";

describe("Row and Cell Highlight Reactivity in DOM", () => {
	beforeEach(() => {
		useLiveModeStore.getState().reset();
	});

	it("applies highlight class to cell when cell key is in highlightedCellKeys", () => {
		const mockCell = {
			row: { id: "row-1", original: { id: "row-1", name: "Alice" } },
			column: { id: "name" },
		} as unknown as Cell<TableRecord, unknown>;
		const mockTable = {
			options: {
				meta: {},
			},
		} as unknown as Table<TableRecord>;

		const { rerender } = render(
			<TableCellWrapper
				cell={mockCell}
				table={mockTable}
				rowIndex={0}
				columnId="name"
				isEditing={false}
				isFocused={false}
				isSelected={false}
			>
				<span>Alice</span>
			</TableCellWrapper>,
		);

		const wrapper = screen.getByRole("button");
		expect(wrapper).not.toHaveClass("bg-emerald-500/20");

		act(() => {
			useLiveModeStore.getState().setHighlights(["row-1"], ["row-1:name"]);
		});
		rerender(
			<TableCellWrapper
				cell={mockCell}
				table={mockTable}
				rowIndex={0}
				columnId="name"
				isEditing={false}
				isFocused={false}
				isSelected={false}
			>
				<span>Alice</span>
			</TableCellWrapper>,
		);

		expect(wrapper).toHaveClass("bg-emerald-500/20");

		act(() => {
			useLiveModeStore.getState().clearHighlights();
		});

		expect(wrapper).not.toHaveClass("bg-emerald-500/20");
	});
});
