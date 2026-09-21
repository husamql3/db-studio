import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarListTablesItem } from "./sidebar-list-tables-item";

const fixtures = vi.hoisted(() => ({
	menuProps: [] as Array<{ tableName: string; schemaName?: string }>,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/table">{children}</a>,
	useParams: () => ({}),
	useLocation: () => ({ pathname: "/table" }),
}));

vi.mock("@/components/sidebar/sidebar-list-tables-menu", () => ({
	SidebarListTablesMenu: (props: { tableName: string; schemaName?: string }) => {
		fixtures.menuProps.push(props);
		return null;
	},
}));

describe("SidebarListTablesItem", () => {
	beforeEach(() => {
		fixtures.menuProps = [];
	});

	it("hands the table's schema to the row menu so a rename targets the right one", () => {
		render(
			<SidebarListTablesItem
				tableName="accounts"
				rowCount={3}
				schemaName="audit"
			/>,
		);

		expect(fixtures.menuProps).toEqual([{ tableName: "accounts", schemaName: "audit" }]);
	});

	it("qualifies the label with a non-public schema", () => {
		render(
			<SidebarListTablesItem
				tableName="accounts"
				rowCount={3}
				schemaName="audit"
			/>,
		);

		expect(screen.getByText("audit.accounts")).toBeInTheDocument();
	});

	it("leaves public tables unqualified", () => {
		render(
			<SidebarListTablesItem
				tableName="users"
				rowCount={1}
				schemaName="public"
			/>,
		);

		expect(screen.queryByText("public.users")).not.toBeInTheDocument();
		expect(screen.getByText("users")).toBeInTheDocument();
	});
});
