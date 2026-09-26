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
}));

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

	it("addresses a composite-key record by every key column", async () => {
		// tenant_id alone matches every user in the tenant, so the save must carry
		// both key columns or it can rewrite unrelated records.
		fixtures.cols = [
			{
				...fixtures.cols[0],
				columnName: "tenant_id",
				isPrimaryKey: true,
				columnDefault: null,
			},
			{ ...fixtures.cols[0], columnName: "user_id", isPrimaryKey: true, columnDefault: null },
			fixtures.cols[1],
		] as ReturnType<typeof makeCols>;
		fixtures.rows = [{ tenant_id: 7, user_id: 42, name: "Ada" }] as never;
		renderSheet();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		expect(fixtures.updateRecord).toHaveBeenCalledWith({
			rowData: fixtures.rows[0],
			updates: [{ columnName: "name", value: "Grace" }],
			primaryKey: "tenant_id",
			primaryKeys: ["tenant_id", "user_id"],
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
			primaryKeys: ["code"],
		});
	});

	it("confirms the discard before showing the delete confirmation", async () => {
		renderSheet();

		const nameInput = screen.getByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		await user.click(screen.getByRole("button", { name: "Delete" }));

		// The dirty draft is confirmed first; deleting is the queued action.
		expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
		expect(screen.queryByText("Delete record")).not.toBeInTheDocument();
		expect(fixtures.deleteCells).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Discard changes" }));

		expect(await screen.findByText("Delete record")).toBeInTheDocument();
		expect(useOverlayStore.getState().openOverlays).toContain("tables.row-delete-record");
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
});
