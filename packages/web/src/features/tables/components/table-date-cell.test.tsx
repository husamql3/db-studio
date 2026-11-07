// East of UTC, local midnight is the previous day in UTC: a date-only column must stage the
// picked local day, not the UTC day of its midnight. Set before any Date is made.
process.env.TZ = "Europe/Istanbul";

import type { StandardizedDataType } from "@db-studio/shared/types";
import type { Cell, Table } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableRecord } from "@/features/tables/table.type";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { TableDateCell } from "./table-cell-variant";

const onCellEditingStop = vi.fn();

const renderDateCell = (row: TableRecord, dataTypeLabel: StandardizedDataType) => {
	const cell = {
		id: "1_day",
		getValue: () => row.day,
		row: { id: "1", original: row },
		column: { id: "day", columnDef: { meta: { dataTypeLabel } } },
	} as Cell<TableRecord, unknown>;

	const table = { options: { meta: { onCellEditingStop } } } as Table<TableRecord>;

	render(
		<TableDateCell
			cell={cell}
			table={table}
			rowIndex={0}
			columnId="day"
			isEditing
			isFocused
			isSelected={false}
		/>,
	);
};

const staged = (row: TableRecord) =>
	useUpdateCellStore.getState().getUpdate(row, "day")?.newValue;

describe("TableDateCell", () => {
	beforeEach(() => {
		useUpdateCellStore.getState().clearUpdates();
		vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 10, 10, 0) });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("stages TODAY on a DATE column as the local day", () => {
		const row = { id: 1, day: "2026-11-01" };
		renderDateCell(row, "date");

		fireEvent.click(screen.getByRole("button", { name: "TODAY" }));

		expect(staged(row)).toBe("2026-11-10");
	});

	it("offers no NULL preset on a NOT NULL column", () => {
		renderDateCell({ id: 1, day: "2026-11-01" }, "date");

		expect(screen.queryByRole("button", { name: "NULL" })).toBeNull();
	});

	// react-day-picker's single mode deselects the selected day, which staged NULL.
	it("keeps the value when the selected day is clicked again", () => {
		const row = { id: 1, day: "2026-11-01" };
		renderDateCell(row, "date");

		fireEvent.click(screen.getByRole("button", { name: /November 1st, 2026/ }));

		expect(staged(row)).not.toBeNull();
	});

	it("keeps the staged value and moves to the next cell on Tab", () => {
		const row = { id: 1, day: "2026-11-01" };
		useUpdateCellStore.getState().setUpdate(row, "day", "2026-11-05", row.day);
		renderDateCell(row, "date");

		fireEvent.keyDown(screen.getByRole("button", { name: /November 5th, 2026/ }), {
			key: "Tab",
		});

		expect(staged(row)).toBe("2026-11-05");
		expect(onCellEditingStop).toHaveBeenLastCalledWith({ direction: "right" });
	});

	it("stages a day picked in an empty DATE cell as that day", () => {
		const row = { id: 1, day: null };
		renderDateCell(row, "date");

		fireEvent.click(screen.getByRole("button", { name: /November 10th, 2026/ }));

		expect(staged(row)).toBe("2026-11-10");
	});

	// A timestamp without a zone ignores an offset, so the ISO instant of local midnight stored
	// 21:00 of the previous day.
	it("stages TODAY on a timestamp column as the local wall-clock time", () => {
		const row = { id: 1, day: "2026-11-01T09:30:00.000Z" };
		renderDateCell(row, "timestamp");

		fireEvent.click(screen.getByRole("button", { name: "TODAY" }));

		expect(staged(row)).toBe("2026-11-10 00:00:00");
	});

	it("stages TODAY on a timestamptz column as the instant of local midnight", () => {
		const row = { id: 1, day: "2026-11-01T09:30:00.000Z" };
		renderDateCell(row, "timestamptz");

		fireEvent.click(screen.getByRole("button", { name: "TODAY" }));

		expect(staged(row)).toBe("2026-11-09T21:00:00.000Z");
	});
});
