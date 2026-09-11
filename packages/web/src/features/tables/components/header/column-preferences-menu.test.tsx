import "@testing-library/jest-dom/vitest";
import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadColumnPrefs, saveColumnPrefs } from "../../stores/column-preferences.store";
import { ColumnPreferencesMenu } from "./column-preferences-menu";

const parts = { dbType: "pg", database: "dbstudio", tableName: "users" };

const makeCol = (columnName: string, isPrimaryKey = false): ColumnInfoSchemaType => ({
	columnName,
	dataType: "text",
	dataTypeLabel: "text",
	isNullable: !isPrimaryKey,
	columnDefault: null,
	isPrimaryKey,
	isForeignKey: false,
	referencedTable: null,
	referencedColumn: null,
	enumValues: null,
});

vi.mock("@/features/schema", () => ({
	useTableCols: ({ tableName }: { tableName: string }) => ({
		tableCols:
			tableName === "users"
				? [makeCol("id", true), makeCol("name", false), makeCol("email", false)]
				: undefined,
	}),
}));

vi.mock("@/stores/database.store", () => ({
	useDatabaseStore: () => ({ dbType: "pg", selectedDatabase: "dbstudio" }),
}));

const openMenu = async () => {
	fireEvent.click(screen.getByRole("button", { name: "Manage columns" }));
	await screen.findByText("Columns");
};

beforeEach(() => {
	localStorage.clear();
});

describe("ColumnPreferencesMenu", () => {
	it("lists every database column and no utility columns", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		expect(screen.getByText("id")).toBeInTheDocument();
		expect(screen.getByText("name")).toBeInTheDocument();
		expect(screen.getByText("email")).toBeInTheDocument();
		expect(screen.queryByText("select")).not.toBeInTheDocument();
		expect(screen.queryByText("__row_actions")).not.toBeInTheDocument();
	});

	it("shows the count of visible columns", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		expect(screen.getByText("3/3 shown")).toBeInTheDocument();
	});

	it("search filters the menu without changing the table", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		fireEvent.change(screen.getByLabelText("Search columns"), {
			target: { value: "em" },
		});
		expect(screen.getByText("email")).toBeInTheDocument();
		expect(screen.queryByText("id")).not.toBeInTheDocument();
		// the table itself stays untouched by search — hidden set is unchanged
		expect(loadColumnPrefs(parts).hidden).toEqual([]);
	});

	it("toggling visibility persists and updates the count", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		fireEvent.click(screen.getByLabelText("Show name"));
		await waitFor(() => {
			expect(loadColumnPrefs(parts).hidden).toEqual(["name"]);
		});
		expect(screen.getByText("2/3 shown")).toBeInTheDocument();
	});

	it("search matches case-insensitively", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		fireEvent.change(screen.getByLabelText("Search columns"), {
			target: { value: "EMAIL" },
		});
		expect(screen.getByText("email")).toBeInTheDocument();
		expect(screen.queryByText("name")).not.toBeInTheDocument();
	});

	it("keeps saved hidden state when reopening", async () => {
		saveColumnPrefs(parts, { order: [], hidden: ["email"] });
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		expect(screen.getByText("2/3 shown")).toBeInTheDocument();
	});

	it("show all makes every column visible while keeping custom order", async () => {
		saveColumnPrefs(parts, {
			order: ["email", "name", "id"],
			hidden: ["email", "name"],
		});
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		expect(screen.getByText("1/3 shown")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Show all" }));
		await waitFor(() => {
			const saved = loadColumnPrefs(parts);
			expect(saved.hidden).toEqual([]);
			expect(saved.order).toEqual(["email", "name", "id"]);
		});
		expect(screen.getByText("3/3 shown")).toBeInTheDocument();
	});

	it("reset restores schema order and default visibility", async () => {
		saveColumnPrefs(parts, { order: ["email", "name", "id"], hidden: ["name"] });
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		fireEvent.click(screen.getByRole("button", { name: "Reset" }));
		await waitFor(() => {
			expect(loadColumnPrefs(parts)).toEqual({ order: [], hidden: [] });
		});
		expect(screen.getByText("3/3 shown")).toBeInTheDocument();
	});

	it("keyboard users can reorder columns with ArrowUp and ArrowDown", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		const emailHandle = screen.getByRole("button", { name: "Reorder email" });
		fireEvent.keyDown(emailHandle, { key: "ArrowUp" });
		await waitFor(() => {
			expect(loadColumnPrefs(parts).order).toEqual(["id", "email", "name"]);
		});
		fireEvent.keyDown(emailHandle, { key: "ArrowDown" });
		await waitFor(() => {
			expect(loadColumnPrefs(parts).order).toEqual(["id", "name", "email"]);
		});
	});

	it("drag and drop reorders columns immediately", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		const items = screen.getAllByRole("listitem");
		// Drag email (index 2) onto id (index 0)
		fireEvent.dragStart(items[2]);
		fireEvent.drop(items[0]);
		await waitFor(() => {
			expect(loadColumnPrefs(parts).order).toEqual(["email", "id", "name"]);
		});
	});

	it("reordering works safely even when search filter is active", async () => {
		render(<ColumnPreferencesMenu tableName="users" />);
		await openMenu();
		// Filter to only 'name' and 'email' (hiding 'id')
		fireEvent.change(screen.getByLabelText("Search columns"), {
			target: { value: "m" },
		});
		const emailHandle = screen.getByRole("button", { name: "Reorder email" });
		fireEvent.keyDown(emailHandle, { key: "ArrowUp" });
		await waitFor(() => {
			expect(loadColumnPrefs(parts).order).toEqual(["id", "email", "name"]);
		});
	});
});
