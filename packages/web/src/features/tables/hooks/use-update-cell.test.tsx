import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { fakeServer, type SentRequest } from "../../../../tests/api";
import { column } from "../../../../tests/column";
import type { CellUpdate } from "../stores/update-cell.store";
import { useUpdateCell } from "./use-update-cell";

// The hook reads the open table from the router; these tests render it without one.
vi.mock("@/hooks/use-table-schema-name", () => ({ useTableSchemaName: () => undefined }));

vi.mock("@/routes/_pathlessLayout/table/$table", () => ({
	Route: { useParams: () => ({ table: "members" }) },
}));

vi.mock("@/lib/logger", () => ({
	logger: { request: vi.fn(), response: vi.fn(), error: vi.fn() },
}));

const col = (columnName: string, isPrimaryKey = false) =>
	column(columnName, { isPrimaryKey, isNullable: !isPrimaryKey });

const cellUpdate: CellUpdate = {
	scope: "members:0",
	rowData: { tenant_id: 7, user_id: 42, name: "Ada" },
	columnName: "name",
	newValue: "Grace",
	originalValue: "Ada",
};

/** Renders the hook against a server holding `cols`; resolves once the columns have loaded. */
const renderUpdateCell = async (
	cols: ColumnInfoSchemaType[],
	save: { status?: number; data: unknown } = { data: { data: "ok" } },
) => {
	const sent = fakeServer({
		"GET /tables/members/columns": { data: { data: cols } },
		"PATCH /records": save,
	});

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});

	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	const { result } = renderHook(() => useUpdateCell(), { wrapper });
	await waitFor(() => expect(sent.length > 0 && queryClient.isFetching() === 0).toBe(true));

	return { result, sent };
};

const saved = (sent: SentRequest[]) => sent.find((request) => request.method === "PATCH");

describe("useUpdateCell", () => {
	beforeEach(() => {
		useDatabaseStore.setState({ selectedDatabase: "shop", dbType: "pg" });
	});

	it("addresses the record by every primary key column", async () => {
		// Matching on tenant_id alone would rewrite every member of the tenant.
		const { result, sent } = await renderUpdateCell([
			col("tenant_id", true),
			col("user_id", true),
			col("name"),
		]);

		await result.current.updateCell([cellUpdate]);

		expect(saved(sent)).toEqual({
			method: "PATCH",
			url: "/records",
			params: { db: "shop" },
			body: {
				tableName: "members",
				updates: [{ rowData: cellUpdate.rowData, columnName: "name", value: "Grace" }],
				primaryKey: "tenant_id",
				primaryKeys: ["tenant_id", "user_id"],
			},
		});
	});

	it("falls back to an id column when the table has no primary key", async () => {
		const { result, sent } = await renderUpdateCell([col("id"), col("name")]);

		await result.current.updateCell([{ ...cellUpdate, rowData: { id: 1, name: "Ada" } }]);

		expect(saved(sent)?.body).toMatchObject({ primaryKey: "id", primaryKeys: ["id"] });
	});

	it("sends no key hint when the schema offers nothing to address the record with", async () => {
		const { result, sent } = await renderUpdateCell([col("name")]);

		await result.current.updateCell([cellUpdate]);

		expect(saved(sent)?.body).not.toHaveProperty("primaryKey");
		expect(saved(sent)?.body).not.toHaveProperty("primaryKeys");
	});

	it("rejects when the save fails, so the caller keeps the selection", async () => {
		const { result } = await renderUpdateCell([col("id", true), col("name")], {
			status: 503,
			data: { error: "connection lost" },
		});

		await expect(
			result.current.updateCell([{ ...cellUpdate, rowData: { id: 1, name: "Ada" } }]),
		).rejects.toThrow("connection lost");
	});
});
