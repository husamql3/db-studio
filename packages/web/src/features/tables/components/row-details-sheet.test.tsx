import { TooltipProvider } from "@db-studio/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { fakeServer, type SentRequest } from "../../../../tests/api";
import { column } from "../../../../tests/column";
import { useRowDetailsStore } from "../stores/row-details.store";
import { RowDetailsSheet } from "./row-details-sheet";

const makeCols = () => [
	column("id", {
		dataType: "number",
		dataTypeLabel: "int",
		isNullable: false,
		columnDefault: "nextval('users_id_seq'::regclass)",
		isPrimaryKey: true,
	}),
	column("name"),
	column("age", { dataType: "number", dataTypeLabel: "int" }),
	column("is_active", {
		dataType: "boolean",
		dataTypeLabel: "boolean",
		columnDefault: "true",
	}),
	column("role", { dataType: "enum", dataTypeLabel: "enum", enumValues: ["admin", "user"] }),
	column("meta", { dataType: "json", dataTypeLabel: "jsonb" }),
	column("created", { dataType: "date", dataTypeLabel: "date" }),
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

const fixtures = {
	cols: [] as ReturnType<typeof makeCols>,
	rows: [] as ReturnType<typeof makeRows>,
	saveStatus: 200,
};

let sent: SentRequest[] = [];
let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

/** The record saves the sheet sent, as the server received them. */
const saves = () => sent.filter((request) => request.method === "PATCH");

// The sheet reads the open table's schema from the router; these tests render it without one.
vi.mock("@/hooks/use-table-schema-name", () => ({ useTableSchemaName: () => undefined }));

vi.mock("@/lib/logger", () => ({
	logger: { request: vi.fn(), response: vi.fn(), error: vi.fn() },
}));

vi.mock(import("nuqs"), async (importOriginal) => ({
	...(await importOriginal()),
	useQueryState: () => [null, vi.fn()],
}));

const renderSheet = (rowIndex = 0) => {
	useOverlayStore.getState().openOverlay("tables.row-details");
	useRowDetailsStore.getState().selectRowDetails(rowIndex);
	render(
		<RowDetailsSheet
			tableName="users"
			rows={fixtures.rows}
		/>,
		{ wrapper },
	);
};

describe("RowDetailsSheet", () => {
	let user: UserEvent;

	beforeEach(() => {
		fixtures.cols = makeCols();
		fixtures.rows = makeRows();
		fixtures.saveStatus = 200;
		useDatabaseStore.setState({ selectedDatabase: "shop", dbType: "pg" });
		sent = fakeServer({
			"GET /tables/users/columns": () => ({ data: { data: fixtures.cols } }),
			"PATCH /records": () =>
				fixtures.saveStatus === 200
					? { data: { data: "Updated 1 record" } }
					: { status: fixtures.saveStatus, data: { error: "boom" } },
		});

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});

		wrapper = ({ children }) => (
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>{children}</TooltipProvider>
			</QueryClientProvider>
		);
		useOverlayStore.setState({ openOverlays: [] });
		useRowDetailsStore.setState({ rowIndex: null });
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

		const nameInput = await screen.findByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(saves()).toHaveLength(1));
		expect(saves()[0]?.body).toEqual({
			tableName: "users",
			updates: [{ rowData: fixtures.rows[0], columnName: "name", value: "Grace" }],
			primaryKey: "tenant_id",
			primaryKeys: ["tenant_id", "user_id"],
		});
	});

	it("saves a foreign key picked from the referenced table", async () => {
		fixtures.cols = [
			fixtures.cols[0],
			column("owner_id", {
				dataType: "number",
				dataTypeLabel: "int",
				isForeignKey: true,
				referencedTable: "owners",
				referencedColumn: "id",
			}),
		] as ReturnType<typeof makeCols>;
		fixtures.rows = [{ id: 1, owner_id: 10 }] as never;
		sent = fakeServer({
			"GET /tables/users/columns": () => ({ data: { data: fixtures.cols } }),
			"GET /tables/owners/columns": { data: { data: [column("id"), column("label")] } },
			"GET /tables/owners/data": {
				data: {
					data: {
						data: [
							{ id: 10, label: "Ten" },
							{ id: 20, label: "Twenty" },
						],
						meta: {
							limit: 30,
							total: 2,
							hasNextPage: false,
							hasPreviousPage: false,
							nextCursor: null,
							prevCursor: null,
						},
					},
				},
			},
			"PATCH /records": { data: { data: "Updated 1 record" } },
		});
		renderSheet();

		await user.click((await screen.findAllByRole("button", { name: "Go to table" }))[0]);
		await user.click(await screen.findByText("Twenty"));
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(saves()).toHaveLength(1));
		expect(saves()[0]?.body).toMatchObject({
			updates: [{ rowData: fixtures.rows[0], columnName: "owner_id", value: 20 }],
		});
	});

	// An emptied number field and the date picker's NULL preset both sent "", which a number or
	// date column rejects. Only a text column keeps "" as the empty string.
	it("saves emptied number and date fields as NULL and an emptied text field as empty", async () => {
		renderSheet();

		await user.clear(await screen.findByDisplayValue("36"));
		await user.clear(screen.getByDisplayValue("Ada"));
		await user.click(
			within(screen.getByRole("group", { name: "created" })).getByRole("button"),
		);
		await user.click(await screen.findByRole("button", { name: "NULL" }));
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(saves()).toHaveLength(1));

		expect(saves()[0]?.body).toMatchObject({
			updates: expect.arrayContaining([
				expect.objectContaining({ columnName: "age", value: null }),
				expect.objectContaining({ columnName: "name", value: "" }),
				expect.objectContaining({ columnName: "created", value: null }),
			]),
		});
	});

	it("keeps the sheet open with edits intact when saving fails", async () => {
		fixtures.saveStatus = 500;
		renderSheet();

		const nameInput = await screen.findByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => {
			expect(saves()).toHaveLength(1);
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

		const codeInput = await screen.findByDisplayValue("A1");
		await user.clear(codeInput);
		await user.type(codeInput, "A2");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		expect(await screen.findByText("Change the primary key?")).toBeInTheDocument();
		expect(saves()).toEqual([]);

		const dialog = screen.getByText("Change the primary key?").closest("[role='alertdialog']");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", { name: "Change primary key" }),
		);

		await waitFor(() => expect(saves()).toHaveLength(1));
		expect(saves()[0]?.body).toEqual({
			tableName: "users",
			updates: [{ rowData: fixtures.rows[0], columnName: "code", value: "A2" }],
			primaryKey: "code",
			primaryKeys: ["code"],
		});
	});

	it("confirms the discard before showing the delete confirmation", async () => {
		renderSheet();

		const nameInput = await screen.findByDisplayValue("Ada");
		await user.clear(nameInput);
		await user.type(nameInput, "Grace");

		await user.click(screen.getByRole("button", { name: "Delete" }));

		// The dirty draft is confirmed first; deleting is the queued action.
		expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
		expect(screen.queryByText("Delete record")).not.toBeInTheDocument();
		expect(sent.filter((request) => request.method === "DELETE")).toEqual([]);

		await user.click(screen.getByRole("button", { name: "Discard changes" }));

		expect(await screen.findByText("Delete record")).toBeInTheDocument();
		expect(useOverlayStore.getState().openOverlays).toContain("tables.row-delete-record");
	});

	it("asks before dropping a dirty row that falls off the page", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().selectRowDetails(2);

		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
			{ wrapper },
		);

		expect(await screen.findByDisplayValue("Cy")).toBeInTheDocument();

		const nameInput = await screen.findByDisplayValue("Cy");
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

	it("resets all fields when untouched draft receives refreshed row data", async () => {
		useOverlayStore.getState().openOverlay("tables.row-details");
		useRowDetailsStore.getState().selectRowDetails(0);

		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
			{ wrapper },
		);

		expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();

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
		useRowDetailsStore.getState().selectRowDetails(0);

		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
			{ wrapper },
		);

		const nameInput = await screen.findByDisplayValue("Ada");
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
		useRowDetailsStore.getState().selectRowDetails(0);

		const { rerender } = render(
			<RowDetailsSheet
				tableName="users"
				rows={fixtures.rows}
			/>,
			{ wrapper },
		);

		const nameInput = await screen.findByDisplayValue("Ada");
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
