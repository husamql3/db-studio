import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlayStore } from "@/stores/overlay.store";
import { SidebarListTablesMenu } from "./sidebar-list-tables-menu";

const fixtures = vi.hoisted(() => ({
	renameTable: vi.fn(async () => "renamed"),
	deleteTable: vi.fn(async () => ({ fkViolation: false, relatedRecords: [] })),
	forceDeleteTable: vi.fn(async () => undefined),
	navigate: vi.fn(),
	renameTableArgs: [] as Array<{ tableName: string; schemaName?: string }>,
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => fixtures.navigate,
	useParams: () => ({}),
	useLocation: () => ({ pathname: "/table/users" }),
}));

vi.mock("@/features/tables", () => ({
	useRenameTable: (args: { tableName: string; schemaName?: string }) => {
		fixtures.renameTableArgs.push(args);
		return { renameTable: fixtures.renameTable, isRenamingTable: false };
	},
	useDeleteTable: () => ({
		deleteTable: fixtures.deleteTable,
		forceDeleteTable: fixtures.forceDeleteTable,
		isDeletingTable: false,
	}),
	useExportFile: () => ({ exportFile: vi.fn(), isExportingFile: false }),
}));

vi.mock("@/hooks/use-copy-table-schema", () => ({
	useCopyTableSchema: () => ({ copyTableSchema: vi.fn(), isCopyingSchema: false }),
}));

const openMenu = async (user: UserEvent, index = 0) => {
	await user.click(screen.getAllByRole("button")[index]);
};

describe("SidebarListTablesMenu", () => {
	let user: UserEvent;

	beforeEach(() => {
		vi.clearAllMocks();
		fixtures.renameTableArgs = [];
		useOverlayStore.setState({ openOverlays: [] });
		user = userEvent.setup();
	});

	it("registers its dialogs per table so a sibling menu stays closed", async () => {
		render(
			<>
				<SidebarListTablesMenu tableName="users" />
				<SidebarListTablesMenu tableName="orders" />
			</>,
		);

		await openMenu(user, 0);
		await user.click(await screen.findByText("Rename table"));

		// One rename dialog, and it belongs to the table whose menu was opened.
		expect(screen.getAllByRole("heading", { name: "Rename Table" })).toHaveLength(1);
		expect((screen.getByLabelText("New name") as HTMLInputElement).value).toBe("users");
		expect(useOverlayStore.getState().openOverlays).toEqual(["tables.rename-table.users"]);
	});

	it("routes the delete confirmation through the overlay registry", async () => {
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));

		expect(useOverlayStore.getState().openOverlays).toEqual(["tables.delete-table.users"]);
		expect(screen.getByRole("heading", { name: "Delete Table" })).toBeInTheDocument();
	});

	it("closes the confirmation and returns home after a clean delete", async () => {
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));
		await user.click(screen.getByRole("button", { name: "Delete Table" }));

		expect(fixtures.deleteTable).toHaveBeenCalledWith("users");
		expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/" });
		expect(useOverlayStore.getState().openOverlays).toEqual([]);
	});

	it("escalates to the force-delete dialog when a foreign key blocks the delete", async () => {
		fixtures.deleteTable.mockResolvedValueOnce({
			fkViolation: true,
			relatedRecords: [{ tableName: "orders", columnName: "user_id", records: [{ id: 1 }] }],
		});
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));
		await user.click(screen.getByRole("button", { name: "Delete Table" }));

		expect(
			await screen.findByRole("heading", { name: "Cannot Delete - Foreign Key Constraint" }),
		).toBeInTheDocument();
		expect(useOverlayStore.getState().openOverlays).toEqual([
			"tables.force-delete-table.users",
		]);
		expect(fixtures.navigate).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Force Delete All" }));

		expect(fixtures.forceDeleteTable).toHaveBeenCalledWith("users");
		expect(fixtures.navigate).toHaveBeenCalledWith({ to: "/" });
		expect(useOverlayStore.getState().openOverlays).toEqual([]);
	});

	it("drops the related-record list when force delete is cancelled", async () => {
		fixtures.deleteTable.mockResolvedValueOnce({
			fkViolation: true,
			relatedRecords: [{ tableName: "orders", columnName: "user_id", records: [{ id: 1 }] }],
		});
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));
		await user.click(screen.getByRole("button", { name: "Delete Table" }));
		await screen.findByRole("heading", { name: "Cannot Delete - Foreign Key Constraint" });

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(fixtures.forceDeleteTable).not.toHaveBeenCalled();
		expect(useOverlayStore.getState().openOverlays).toEqual([]);
	});

	it("deregisters the force-delete overlay when it is dismissed", async () => {
		fixtures.deleteTable.mockResolvedValueOnce({
			fkViolation: true,
			relatedRecords: [{ tableName: "orders", columnName: "user_id", records: [{ id: 1 }] }],
		});
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));
		await user.click(screen.getByRole("button", { name: "Delete Table" }));
		await screen.findByRole("heading", { name: "Cannot Delete - Foreign Key Constraint" });

		await user.keyboard("{Escape}");

		expect(useOverlayStore.getState().openOverlays).toEqual([]);
		expect(fixtures.forceDeleteTable).not.toHaveBeenCalled();
	});

	it("deregisters the overlay when the confirmation is dismissed", async () => {
		render(<SidebarListTablesMenu tableName="users" />);

		await openMenu(user);
		await user.click(await screen.findByText("Delete table"));
		expect(useOverlayStore.getState().openOverlays).toEqual(["tables.delete-table.users"]);

		await user.keyboard("{Escape}");

		expect(useOverlayStore.getState().openOverlays).toEqual([]);
		expect(fixtures.deleteTable).not.toHaveBeenCalled();
	});

	it("carries the table's schema into the rename request", async () => {
		render(
			<SidebarListTablesMenu
				tableName="accounts"
				schemaName="audit"
			/>,
		);

		await openMenu(user);
		await user.click(await screen.findByText("Rename table"));

		const input = screen.getByLabelText("New name");
		await user.clear(input);
		await user.type(input, "archived_accounts");
		await user.click(screen.getByRole("button", { name: "Rename Table" }));

		expect(fixtures.renameTable).toHaveBeenCalledWith({
			newTableName: "archived_accounts",
			schemaName: "audit",
		});
		expect(fixtures.renameTableArgs[0]).toEqual({
			tableName: "accounts",
			schemaName: "audit",
		});
	});
});
