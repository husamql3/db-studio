import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRowDetailsStore } from "../stores/row-details.store";
import { RowDetailsSheet } from "./row-details-sheet";

const makeCols = () => [
	{
		columnName: "id",
		dataType: "number",
		dataTypeLabel: "int",
		isNullable: false,
		columnDefault: "nextval('users_id_seq'::regclass)",
		isPrimaryKey: true,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "name",
		dataType: "text",
		dataTypeLabel: "text",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "age",
		dataType: "number",
		dataTypeLabel: "int",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "is_active",
		dataType: "boolean",
		dataTypeLabel: "boolean",
		isNullable: true,
		columnDefault: "true",
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "role",
		dataType: "enum",
		dataTypeLabel: "enum",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: ["admin", "user"],
	},
	{
		columnName: "meta",
		dataType: "json",
		dataTypeLabel: "jsonb",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
	{
		columnName: "created",
		dataType: "date",
		dataTypeLabel: "date",
		isNullable: true,
		columnDefault: null,
		isPrimaryKey: false,
		isForeignKey: false,
		referencedTable: null,
		referencedColumn: null,
		enumValues: null,
	},
];

const makeRows = () => [
	{
		id: 1,
		name: "Ada",
		age: 36,
		is_active: true,
		role: "admin",
		meta: { a: 1 },
		created: "2024-01-02",
	},
	{ id: 2, name: "Bob", age: 41, is_active: false, role: "user", meta: null, created: null },
	{
		id: 3,
		name: "Cy",
		age: 29,
		is_active: true,
		role: "user",
		meta: {},
		created: "2024-03-04",
	},
];

const fixtures = vi.hoisted(() => ({
	cols: [] as ReturnType<typeof makeCols>,
	rows: [] as ReturnType<typeof makeRows>,
	updateRecord: vi.fn(async () => "Updated 1 record"),
	deleteCells: vi.fn(async () => ({ deletedCount: 1 })),
	copyText: vi.fn(async (_value: string) => {}),
}));

vi.mock("./row-details-utils", async (importOriginal) => {
	const mod = await importOriginal<typeof import("./row-details-utils")>();
	return { ...mod, copyTextToClipboard: (...args: unknown[]) => fixtures.copyText(...args) };
});

vi.mock("@/features/schema", () => ({
	useTableCols: () => ({ tableCols: fixtures.cols, isLoadingTableCols: false }),
}));
vi.mock("@/features/tables/hooks/use-update-record", () => ({
	useUpdateRecord: () => ({
		updateRecord: fixtures.updateRecord,
		isUpdatingRecord: false,
	}),
}));
vi.mock("@/features/tables/hooks/use-delete-cell", () => ({
	useDeleteCells: () => ({
		deleteCells: fixtures.deleteCells,
		isDeletingCells: false,
	}),
}));
vi.mock("@/features/records", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/features/records")>();
	return { ...mod, RecordReferenceSheet: () => null };
});
vi.mock("nuqs", () => ({
	useQueryState: () => [null, vi.fn()],
}));

const renderSheet = (rowIndex = 0) => {
	useOverlayStore.getState().openOverlay("tables.row-details");
	useRowDetailsStore.getState().setRowDetails("users", rowIndex);
	render(
		<RowDetailsSheet
			tableName="users"
			rows={fixtures.rows}
		/>,
	);
};

const sheetDialog = () => {
	const title = screen.getByText("Row details");
	const dialog = title.closest("[role='dialog']");
	expect(dialog).not.toBeNull();
	return dialog as HTMLElement;
};

describe("RowDetailsSheet", () => {
	let user: UserEvent;

	beforeEach(() => {
		vi.clearAllMocks();
		fixtures.cols = makeCols();
		fixtures.rows = makeRows();
		useOverlayStore.setState({ openOverlays: [] });
		useRowDetailsStore.setState({ tableName: null, rowIndex: null });
		user = userEvent.setup();
	});

	it("shows every field with formatted values and type-appropriate controls", () => {
		renderSheet();

		expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
		expect(screen.getByDisplayValue("36")).toBeInTheDocument();
		expect(screen.getByDisplayValue('{"a":1}')).toBeInTheDocument();
		// Boolean, enum, and date controls keep an accessible group label.
		expect(screen.getByRole("group", { name: "is_active" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "role" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "created" })).toBeInTheDocument();
		// Text, number, and JSON inputs are named directly.
		expect(screen.getByRole("textbox", { name: "name" })).toBeInTheDocument();
		expect(screen.getByRole("spinbutton", { name: "age" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "meta" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "is_active" })).toBeInTheDocument();
	});

	it("renders generated primary keys read-only", () => {
		renderSheet();

		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.queryByDisplayValue("1")).not.toBeInTheDocument();
	});

	it("copies an individual value to the clipboard", async () => {
		renderSheet();

		const copyButtons = screen.getAllByLabelText("Copy value");
		expect(copyButtons.length).toBeGreaterThan(1);
		await user.click(copyButtons[1]);

		expect(fixtures.copyText).toHaveBeenCalledWith("Ada");
		expect(await screen.findByLabelText("Copied")).toBeInTheDocument();
	});

	it("saves all dirty fields through one update call", async () => {
		renderSheet();

		const saveButton = screen.getByRole("button", { name: "Save changes" });
		expect(saveButton).toBeDisabled();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		expect(saveButton).not.toBeDisabled();

		await user.click(saveButton);

		expect(fixtures.updateRecord).toHaveBeenCalledTimes(1);
		expect(fixtures.updateRecord).toHaveBeenCalledWith({
			rowData: fixtures.rows[0],
			updates: [{ columnName: "name", value: "Grace" }],
			primaryKey: "id",
		});
		await waitFor(() => {
			expect(screen.queryByText("Row details")).not.toBeInTheDocument();
		});
	});

	it("keeps the sheet open with edits intact when saving fails", async () => {
		fixtures.updateRecord.mockRejectedValueOnce(new Error("boom"));
		renderSheet();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => {
			expect(fixtures.updateRecord).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByText("Row details")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Grace")).toBeInTheDocument();
	});

	it("asks for confirmation before changing the primary key", async () => {
		fixtures.cols = [
			{
				columnName: "code",
				dataType: "text",
				dataTypeLabel: "text",
				isNullable: false,
				columnDefault: null,
				isPrimaryKey: true,
				isForeignKey: false,
				referencedTable: null,
				referencedColumn: null,
				enumValues: null,
			},
			{
				columnName: "name",
				dataType: "text",
				dataTypeLabel: "text",
				isNullable: true,
				columnDefault: null,
				isPrimaryKey: false,
				isForeignKey: false,
				referencedTable: null,
				referencedColumn: null,
				enumValues: null,
			},
		];
		fixtures.rows = [{ code: "A1", name: "Ada" }];
		renderSheet();

		const codeInput = screen.getByDisplayValue("A1");
		await user.clear(codeInput);
		await user.type(codeInput, "A2");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		expect(await screen.findByText("Change the primary key?")).toBeInTheDocument();
		expect(fixtures.updateRecord).not.toHaveBeenCalled();

		const dialog = screen.getByText("Change the primary key?").closest("[role='alertdialog']");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", { name: "Change primary key" }),
		);

		expect(fixtures.updateRecord).toHaveBeenCalledWith({
			rowData: fixtures.rows[0],
			updates: [{ columnName: "code", value: "A2" }],
			primaryKey: "code",
		});
	});

	it("protects unsaved changes when closing", async () => {
		renderSheet();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		const closeButtons = screen.getAllByRole("button", { name: "Close" });
		const closeButton = closeButtons.find((button) => button.textContent === "Close");
		expect(closeButton).toBeDefined();
		await user.click(closeButton as HTMLElement);
		expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
		expect(screen.getByText("Row details")).toBeInTheDocument();

		const dialog = screen
			.getByText("Discard unsaved changes?")
			.closest("[role='alertdialog']");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", { name: "Discard changes" }),
		);
		await waitFor(() => {
			expect(screen.queryByText("Row details")).not.toBeInTheDocument();
		});
	});

	it("deletes the record behind a destructive confirmation", async () => {
		renderSheet();

		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("Delete record")).toBeInTheDocument();

		const dialog = screen.getByText("Delete record").closest("[role='alertdialog']");
		await user.click(within(dialog as HTMLElement).getByRole("button", { name: "Delete" }));

		expect(fixtures.deleteCells).toHaveBeenCalledWith([fixtures.rows[0]]);
		await waitFor(() => {
			expect(screen.queryByText("Row details")).not.toBeInTheDocument();
		});
	});

	it("disables deletion and saving for tables without record identity", async () => {
		fixtures.cols = fixtures.cols.filter((col) => !col.isPrimaryKey);
		renderSheet();

		expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
	});

	it("navigates between rows with chevrons and boundary states", async () => {
		renderSheet(0);

		expect(screen.getByRole("button", { name: "Previous row" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Next row" })).not.toBeDisabled();

		await user.click(screen.getByRole("button", { name: "Next row" }));
		expect(await screen.findByDisplayValue("Bob")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Next row" }));
		expect(await screen.findByDisplayValue("Cy")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Next row" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Previous row" })).not.toBeDisabled();
	});

	it("navigates with the keyboard outside editors", async () => {
		renderSheet(0);
		sheetDialog();

		await user.keyboard("{ArrowDown}");
		expect(await screen.findByDisplayValue("Bob")).toBeInTheDocument();

		await user.keyboard("{ArrowUp}");
		expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
	});

	it("cancels the primary key change without saving", async () => {
		fixtures.cols = [
			{
				columnName: "code",
				dataType: "text",
				dataTypeLabel: "text",
				isNullable: false,
				columnDefault: null,
				isPrimaryKey: true,
				isForeignKey: false,
				referencedTable: null,
				referencedColumn: null,
				enumValues: null,
			},
		];
		fixtures.rows = [{ code: "A1" }];
		renderSheet();

		const codeInput = screen.getByDisplayValue("A1");
		await user.clear(codeInput);
		await user.type(codeInput, "A2");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		expect(await screen.findByText("Change the primary key?")).toBeInTheDocument();
		const dialog = screen.getByText("Change the primary key?").closest("[role='alertdialog']");
		await user.click(within(dialog as HTMLElement).getByRole("button", { name: "Cancel" }));

		expect(fixtures.updateRecord).not.toHaveBeenCalled();
		expect(screen.queryByText("Change the primary key?")).not.toBeInTheDocument();
		expect(screen.getByText("Row details")).toBeInTheDocument();
	});

	it("opens the reference picker for foreign keys", async () => {
		fixtures.cols = [
			{
				columnName: "team_id",
				dataType: "number",
				dataTypeLabel: "int",
				isNullable: true,
				columnDefault: null,
				isPrimaryKey: false,
				isForeignKey: true,
				referencedTable: "teams",
				referencedColumn: "id",
				enumValues: null,
			},
		];
		fixtures.rows = [{ team_id: 7 }];
		renderSheet();

		await user.click(screen.getByRole("button", { name: "Go to table" }));

		expect(useOverlayStore.getState().openOverlays).toContain("records.record-reference");
	});

	it("asks before dropping a dirty row that falls off the page", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 2);
		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
		);
		expect(await screen.findByDisplayValue("Cy")).toBeInTheDocument();

		const nameInput = screen.getByDisplayValue("Cy");
		await user.clear(nameInput);
		await user.type(nameInput, "Cyll");

		rerender(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows.slice(0, 1)}
			/>,
		);
		expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();

		const dialog = screen
			.getByText("Discard unsaved changes?")
			.closest("[role='alertdialog']");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", { name: "Discard changes" }),
		);
		await waitFor(() => {
			expect(screen.queryByText("Row details")).not.toBeInTheDocument();
		});
	});

	it("asks before navigating away with dirty fields", async () => {
		renderSheet(0);

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		await user.click(screen.getByRole("button", { name: "Next row" }));
		expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();

		const dialog = screen
			.getByText("Discard unsaved changes?")
			.closest("[role='alertdialog']");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", { name: "Discard changes" }),
		);
		expect(await screen.findByDisplayValue("Bob")).toBeInTheDocument();
	});

	it("resets all fields when untouched draft receives refreshed row data", () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
		);

		expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();

		const updatedRows = makeRows();
		updatedRows[0] = { ...updatedRows[0], name: "Ada Lovelace" };
		rerender(
			<RowDetailsSheet
				tableName="users"
				rows={updatedRows}
			/>,
		);

		expect(screen.getByDisplayValue("Ada Lovelace")).toBeInTheDocument();
	});

	it("preserves dirty fields when refreshed row has the same record identity", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
		);

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		const updatedRows = makeRows();
		updatedRows[0] = { ...updatedRows[0], age: 37 };
		rerender(
			<RowDetailsSheet
				tableName="users"
				rows={updatedRows}
			/>,
		);

		expect(screen.getByDisplayValue("Grace")).toBeInTheDocument();
		expect(screen.getByDisplayValue("37")).toBeInTheDocument();
	});

	it("resets to new record values when row identity changes underneath", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
		);

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		const reorderedRows = [fixtures.rows[1], fixtures.rows[0]];
		rerender(
			<RowDetailsSheet
				tableName="users"
				rows={reorderedRows}
			/>,
		);

		expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
		expect(screen.queryByDisplayValue("Grace")).not.toBeInTheDocument();
	});

	it("preserves dirty state and baseline after row refresh and subsequent edits", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
		);

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		const saveButton = screen.getByRole("button", { name: "Save changes" });
		expect(saveButton).toBeEnabled();

		// Refresh from server with updated age, keeping same id: 1
		const updatedRows = makeRows();
		updatedRows[0] = { ...updatedRows[0], age: 37 };
		rerender(
			<RowDetailsSheet
				tableName="users"
				rows={updatedRows}
			/>,
		);

		expect(screen.getByDisplayValue("Grace")).toBeInTheDocument();
		expect(screen.getByDisplayValue("37")).toBeInTheDocument();
		expect(saveButton).toBeEnabled();

		// Change name again
		await user.type(nameInput, " Hopper");
		expect(screen.getByDisplayValue("Grace Hopper")).toBeInTheDocument();
		expect(saveButton).toBeEnabled();

		// Restore name back to Grace
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		expect(screen.getByDisplayValue("Grace")).toBeInTheDocument();
		expect(saveButton).toBeEnabled();
	});
});
