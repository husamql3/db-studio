import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlayStore } from "@/stores/overlay.store";
import { useRowDetailsStore } from "../stores/row-details.store";
import { TableTabContainer } from "./table-tab-container";

const fixtures = vi.hoisted(() => ({
	cols: [
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
	],
	gridRows: [{ original: { id: 1, name: "Ada" } }, { original: { id: 2, name: "Bob" } }],
	// Mirrors useReactTable: a stable instance whose row model resolves live.
	table: {} as { getRowModel: () => { rows: Array<{ original: Record<string, unknown> }> } },
	updateRecord: vi.fn(async () => "Updated 1 record"),
	deleteCells: vi.fn(async () => ({ deletedCount: 1 })),
}));

fixtures.table = {
	getRowModel: () => ({ rows: fixtures.gridRows }),
};

vi.mock("../hooks/use-table-data", () => ({
	useTableData: () => ({
		tableData: { data: [{ id: 1 }, { id: 2 }] },
		isLoadingTableData: false,
		errorTableData: null,
	}),
}));
vi.mock("@/features/schema", () => ({
	useTableCols: () => ({
		tableCols: fixtures.cols,
		isLoadingTableCols: false,
		errorTableCols: null,
	}),
}));
vi.mock("../hooks/use-table-model", () => ({
	useTableModel: () => ({
		table: fixtures.table,
		selectedRows: [],
		setRowSelection: vi.fn(),
	}),
}));
vi.mock("./table-grid", () => ({
	TableGrid: () => null,
}));
vi.mock("@/stores/database.store", () => ({
	useDatabaseStore: () => ({ dbType: "pg" }),
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

describe("TableTabContainer row details wiring", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fixtures.gridRows = [
			{ original: { id: 1, name: "Ada" } },
			{ original: { id: 2, name: "Bob" } },
		];
		useOverlayStore.setState({ openOverlays: [] });
		useRowDetailsStore.setState({ tableName: null, rowIndex: null });
	});

	it("feeds refreshed row-model output to the sheet, not a stale memo", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const { rerender } = render(<TableTabContainer tableName="users" />);

		expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "id" })).toHaveTextContent("1");

		// Simulate a sorted/refreshed row model behind the open sheet.
		fixtures.gridRows = [
			{ original: { id: 2, name: "Bob" } },
			{ original: { id: 1, name: "Ada" } },
		];
		rerender(<TableTabContainer tableName="users" />);

		// Untouched drafts update all displayed fields to follow the refreshed row.
		expect(await screen.findByText("2")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
	});

	it("preserves dirty field values when the refreshed row has the same stable record identity", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().setRowDetails("users", 0);
		const user = userEvent.setup();
		const { rerender } = render(<TableTabContainer tableName="users" />);

		const nameInput = await screen.findByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		// Simulate background data refresh for the same record (id: 1)
		fixtures.gridRows = [
			{ original: { id: 1, name: "Ada" } },
			{ original: { id: 2, name: "Bob" } },
		];
		rerender(<TableTabContainer tableName="users" />);

		expect(screen.getByRole("group", { name: "id" })).toHaveTextContent("1");
		expect(screen.getByDisplayValue("Grace")).toBeInTheDocument();
	});
});
