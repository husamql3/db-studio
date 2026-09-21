import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import type { CellUpdate } from "../stores/update-cell.store";
import { useUpdateCell } from "./use-update-cell";

const fixtures = vi.hoisted(() => ({
	updateRecords: vi.fn(),
	tableCols: [] as ColumnInfoSchemaType[],
}));

vi.mock("@/shared/api", () => ({
	updateRecords: (...args: unknown[]) => fixtures.updateRecords(...args),
}));
vi.mock("@/routes/_pathlessLayout/table/$table", () => ({
	Route: { useParams: () => ({ table: "members" }) },
}));
vi.mock("@/features/schema", () => ({
	useTableCols: () => ({ tableCols: fixtures.tableCols }),
}));

const col = (columnName: string, isPrimaryKey = false): ColumnInfoSchemaType =>
	({
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
	}) as ColumnInfoSchemaType;

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider
		client={
			new QueryClient({
				defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
			})
		}
	>
		{children}
	</QueryClientProvider>
);

const cellUpdate: CellUpdate = {
	scope: "members:0",
	rowData: { tenant_id: 7, user_id: 42, name: "Ada" },
	columnName: "name",
	newValue: "Grace",
	originalValue: "Ada",
};

describe("useUpdateCell", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useDatabaseStore.setState({ selectedDatabase: "shop", dbType: "pg" });
		fixtures.updateRecords.mockResolvedValue({ data: { data: "Updated 1 record" } });
	});

	it("addresses the record by every primary key column", async () => {
		// Matching on tenant_id alone would rewrite every member of the tenant.
		fixtures.tableCols = [col("tenant_id", true), col("user_id", true), col("name")];
		const { result } = renderHook(() => useUpdateCell(), { wrapper });

		await result.current.updateCell([cellUpdate]);

		expect(fixtures.updateRecords).toHaveBeenCalledWith({
			tableName: "members",
			updates: [{ rowData: cellUpdate.rowData, columnName: "name", value: "Grace" }],
			primaryKey: "tenant_id",
			primaryKeys: ["tenant_id", "user_id"],
			db: "shop",
		});
	});

	it("falls back to an id column when the table has no primary key", async () => {
		fixtures.tableCols = [col("id"), col("name")];
		const { result } = renderHook(() => useUpdateCell(), { wrapper });

		await result.current.updateCell([{ ...cellUpdate, rowData: { id: 1, name: "Ada" } }]);

		expect(fixtures.updateRecords).toHaveBeenCalledWith(
			expect.objectContaining({ primaryKey: "id", primaryKeys: ["id"] }),
		);
	});

	it("sends no key hint when the schema offers nothing to address the record with", async () => {
		fixtures.tableCols = [col("name")];
		const { result } = renderHook(() => useUpdateCell(), { wrapper });

		await result.current.updateCell([cellUpdate]);

		const payload = fixtures.updateRecords.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload).not.toHaveProperty("primaryKey");
		expect(payload).not.toHaveProperty("primaryKeys");
	});
});
