import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { render, screen, within } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { AddRecordField } from "./add-record-field";

vi.mock("nuqs", () => ({ useQueryState: () => [null, vi.fn()] }));

const column = (overrides: Partial<ColumnInfoSchemaType>): ColumnInfoSchemaType =>
	({
		columnName: "avatar",
		dataType: "text",
		dataTypeLabel: "bytea",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
		...overrides,
	}) as ColumnInfoSchemaType;

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
				col={column({})}
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

	it("shows the stored bytes read-only next to the picker", () => {
		render(
			<Harness
				col={column({})}
				defaultValues={{ avatar: "\\x89504e47" }}
			/>,
		);

		expect(screen.getByRole("group", { name: "avatar stored value" }).textContent).toBe(
			"\\x89504e47",
		);
	});

	it("omits the read-only preview when the column is empty", () => {
		render(
			<Harness
				col={column({})}
				defaultValues={{ avatar: "" }}
			/>,
		);

		expect(screen.queryByRole("group", { name: "avatar stored value" })).toBeNull();
		expect(
			(
				within(screen.getByRole("group", { name: "avatar" })).getByLabelText(
					"avatar",
				) as HTMLInputElement
			).type,
		).toBe("file");
	});
});
