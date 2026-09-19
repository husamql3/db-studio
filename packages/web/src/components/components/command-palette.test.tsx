import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	openOverlay: vi.fn(),
	requestAssistant: vi.fn(),
	exportFile: vi.fn(),
	copyTableSchema: vi.fn(),
	toggleSidebarOpen: vi.fn(),
	toggleSidebarPinned: vi.fn(),
	toggleTheme: vi.fn(),
	routeParams: {} as { table?: string },
	pathname: "/",
	dbType: "pg" as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useLocation: () => ({ pathname: mocks.pathname }),
	useParams: () => mocks.routeParams,
}));
vi.mock("@/stores/database.store", () => ({
	useDatabaseStore: () => ({ dbType: mocks.dbType, selectedDatabase: "shop" }),
}));
vi.mock("@/stores/overlay.store", () => ({
	useOverlayStore: () => ({ openOverlay: mocks.openOverlay }),
}));
vi.mock("@/stores/personal-preferences.store", () => ({
	usePersonalPreferencesStore: () => ({
		sidebar: { isOpen: true, isPinned: true, width: 400 },
		toggleSidebarOpen: mocks.toggleSidebarOpen,
		toggleSidebarPinned: mocks.toggleSidebarPinned,
	}),
}));
vi.mock("@/hooks/use-theme", () => ({
	useTheme: () => ({ isDark: true, toggleTheme: mocks.toggleTheme }),
}));
vi.mock("@/features/tables", () => ({
	useTablesList: () => ({
		tablesList: [
			{ tableName: "users", rowCount: 2 },
			{ tableName: "orders", rowCount: 0 },
		],
		isLoadingTablesList: false,
		errorTablesList: null,
	}),
	useExportFile: () => ({ exportFile: mocks.exportFile, isExportingFile: false }),
}));
vi.mock("@/features/ai-assistant", () => ({
	useAssistantRequestStore: () => ({ requestAssistant: mocks.requestAssistant }),
}));
vi.mock("@/hooks/use-copy-table-schema", () => ({
	useCopyTableSchema: () => ({
		copyTableSchema: mocks.copyTableSchema,
		isCopyingSchema: false,
	}),
}));

const openPalette = async (user: UserEvent) => {
	await user.keyboard("{Control>}k{/Control}");
	expect(
		await screen.findByPlaceholderText("Search commands... (type > for tables)"),
	).toBeInTheDocument();
};

const commandItem = (text: string) => {
	const label = screen.getByText(text);
	const item = label.closest("[data-slot='command-item']");
	expect(item).not.toBeNull();
	return item as HTMLElement;
};

describe("CommandPalette", () => {
	let user: UserEvent;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.routeParams = {};
		mocks.pathname = "/";
		mocks.dbType = "pg";
		user = userEvent.setup();
	});

	it("opens and closes with ctrl+k and escape", async () => {
		render(<CommandPalette />);

		expect(
			screen.queryByPlaceholderText("Search commands... (type > for tables)"),
		).not.toBeInTheDocument();

		await openPalette(user);

		await user.keyboard("{Escape}");
		await waitFor(() => {
			expect(
				screen.queryByPlaceholderText("Search commands... (type > for tables)"),
			).not.toBeInTheDocument();
		});
	});

	it("navigates to a table from recent tables", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		await user.click(commandItem("users"));

		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/table/$table",
			params: { table: "users" },
			search: {},
		});
	});

	it("searches tables with the > shortcut and filters by name", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		const input = screen.getByPlaceholderText("Search commands... (type > for tables)");
		await user.click(input);
		await user.keyboard(">");

		expect(await screen.findByPlaceholderText("Search tables...")).toBeInTheDocument();

		await user.keyboard("ord");
		await user.click(commandItem("orders"));

		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/table/$table",
			params: { table: "orders" },
			search: {},
		});
	});

	it("has no placeholder or coming-soon commands", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
		expect(screen.queryByText("Backup Database")).not.toBeInTheDocument();
		expect(screen.queryByText("Manage Permissions")).not.toBeInTheDocument();
		expect(screen.queryByText("Bulk Delete")).not.toBeInTheDocument();
		expect(screen.queryByText("User Management")).not.toBeInTheDocument();
	});

	it("disables table-dependent commands with a reason when no table is selected", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		const addRow = commandItem("Add New Row");
		expect(addRow).toHaveAttribute("data-disabled", "true");
		expect(screen.getAllByText("Select a table first").length).toBeGreaterThan(0);

		await user.click(addRow);
		expect(mocks.openOverlay).not.toHaveBeenCalled();
	});

	it("wires create-table to its overlay", async () => {
		mocks.routeParams = { table: "users" };
		mocks.pathname = "/table/users";
		render(<CommandPalette />);
		await openPalette(user);

		await user.click(commandItem("Create New Table"));

		expect(mocks.openOverlay).toHaveBeenCalledWith("table-builder.create-table");
	});

	it("wires go-to commands to real routes", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		await user.click(commandItem("Go to Query Runner"));

		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/runner" });
	});

	it("wires the chat command to the assistant overlay", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		await user.click(commandItem("Chat with AI Assistant"));

		expect(mocks.openOverlay).toHaveBeenCalledWith("chat.assistant");
	});

	it("wires export to the real export action for the active table", async () => {
		mocks.routeParams = { table: "users" };
		mocks.pathname = "/table/users";
		render(<CommandPalette />);
		await openPalette(user);

		await user.click(commandItem("Export Table as CSV"));

		expect(mocks.exportFile).toHaveBeenCalledWith({ tableName: "users", format: "csv" });
	});

	it("shows redis-specific commands for redis databases", async () => {
		mocks.dbType = "redis";
		mocks.pathname = "/browser";
		render(<CommandPalette />);
		await openPalette(user);

		expect(screen.getByText("Go to Redis Browser")).toBeInTheDocument();
		expect(screen.getByText("Create Redis Key")).toBeInTheDocument();
		expect(screen.queryByText("Create New Table")).not.toBeInTheDocument();
		expect(screen.queryByText("Search Tables")).not.toBeInTheDocument();
	});

	it("resets mode and input after running an action", async () => {
		render(<CommandPalette />);
		await openPalette(user);

		const input = screen.getByPlaceholderText("Search commands... (type > for tables)");
		await user.click(input);
		await user.keyboard(">");
		expect(await screen.findByPlaceholderText("Search tables...")).toBeInTheDocument();

		await user.click(commandItem("orders"));
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/table/$table",
			params: { table: "orders" },
			search: {},
		});

		// Reopening starts fresh in "all" mode instead of the stale tables mode.
		await openPalette(user);
	});

	it("enables record commands only on the table data screen", async () => {
		mocks.routeParams = { table: "users" };
		mocks.pathname = "/schema/users";
		render(<CommandPalette />);
		await openPalette(user);

		expect(commandItem("Add Column")).toHaveAttribute("data-disabled", "false");
		const addRow = commandItem("Add New Row");
		expect(addRow).toHaveAttribute("data-disabled", "true");
		expect(screen.getAllByText("Open the table data screen first").length).toBeGreaterThan(0);
	});

	it("disables schema commands for schemaless databases", async () => {
		mocks.dbType = "mongodb";
		mocks.routeParams = { table: "users" };
		mocks.pathname = "/table/users";
		render(<CommandPalette />);
		await openPalette(user);

		// Records still work for MongoDB collections, DDL does not.
		expect(commandItem("Add New Row")).toHaveAttribute("data-disabled", "false");
		expect(
			screen.getAllByText("Not available for schemaless databases").length,
		).toBeGreaterThan(0);
		expect(screen.queryByText("Create New Table")).not.toBeInTheDocument();

		await user.click(commandItem("Add Column"));
		expect(mocks.openOverlay).not.toHaveBeenCalled();
	});
});
