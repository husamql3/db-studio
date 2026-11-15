import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { column } from "../../../../tests/column";
import { AddRecordField } from "./add-record-field";

vi.mock("nuqs", () => ({ useQueryState: () => [null, vi.fn()] }));

const avatar = (overrides: Partial<ColumnInfoSchemaType> = {}) =>
	column("avatar", { dataTypeLabel: "bytea", ...overrides });

const Harness = ({
	col,
	defaultValues,
}: {
	col: ColumnInfoSchemaType;
	defaultValues: Record<string, string>;
}) => {
	const methods = useForm({ defaultValues });

	return (
		<FormProvider {...methods}>
			<AddRecordField
				{...col}
				hideLabel
			/>
			<output aria-label="form value">{methods.watch(col.columnName)}</output>
		</FormProvider>
	);
};

describe("AddRecordField — binary columns", () => {
	it("never drives the file picker from a stored value", () => {
		// Assigning a non-empty value to <input type="file"> throws InvalidStateError,
		// so a populated bytea column must leave the picker uncontrolled.
		render(
			<Harness
				col={avatar()}
				defaultValues={{ avatar: "\\x89504e47" }}
			/>,
		);

		const picker = within(screen.getByRole("group", { name: "avatar" })).getByLabelText(
			"avatar",
		) as HTMLInputElement;

		expect(picker.type).toBe("file");
		expect(picker.getAttribute("value")).toBeNull();
		expect(picker.value).toBe("");
	});
});

describe("AddRecordField — DATE columns", () => {
	const day = column("day", { dataType: "date", dataTypeLabel: "date" });

	afterEach(() => {
		vi.useRealTimers();
	});

	// East of UTC, the ISO instant of local midnight is the previous day.
	it("writes TODAY as the local day east of UTC", () => {
		process.env.TZ = "Europe/Istanbul";
		vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 10, 10, 0) });
		render(
			<Harness
				col={day}
				defaultValues={{ day: "" }}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "NULL" }));
		fireEvent.click(screen.getByRole("button", { name: "TODAY" }));

		expect(screen.getByRole("status", { name: "form value" }).textContent).toBe("2026-11-10");
	});

	// West of UTC, `new Date("yyyy-mm-dd")` is UTC midnight, the previous local day.
	it("shows a stored day as that day west of UTC", () => {
		process.env.TZ = "America/New_York";
		render(
			<Harness
				col={day}
				defaultValues={{ day: "2026-11-10" }}
			/>,
		);

		expect(screen.getByRole("button", { name: "10/11/2026" })).toBeTruthy();
	});
});
