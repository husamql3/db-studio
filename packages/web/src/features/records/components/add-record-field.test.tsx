import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { render, screen, within } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
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
