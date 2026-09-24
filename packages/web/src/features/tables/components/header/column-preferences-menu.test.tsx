import "@testing-library/jest-dom/vitest";
import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getColumnPrefs,
	useColumnPreferencesStore,
} from "../../stores/column-preferences.store";
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
	useColumnPreferencesStore.setState({ prefsByTable: {} });
});

describe("ColumnPreferencesMenu", () => {
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
			expect(getColumnPrefs(parts).order).toEqual(["id", "email", "name"]);
		});
	});
});
