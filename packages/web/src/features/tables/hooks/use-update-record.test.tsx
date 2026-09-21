import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { useUpdateRecord } from "./use-update-record";

const updateRecords = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api", () => ({
	updateRecords: (...args: unknown[]) => updateRecords(...args),
}));

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return { wrapper, invalidateSpy };
};

describe("useUpdateRecord", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useDatabaseStore.setState({ selectedDatabase: "shop", dbType: "pg" });
		updateRecords.mockResolvedValue({ data: { data: "Updated 1 record" } });
	});

	it("sends one save with the resolved primary key", async () => {
		const { wrapper, invalidateSpy } = createWrapper();
		const { result } = renderHook(() => useUpdateRecord({ tableName: "users" }), {
			wrapper,
		});

		await result.current.updateRecord({
			rowData: { id: 1, name: "Ada" },
			updates: [{ columnName: "name", value: "Grace" }],
			primaryKey: "id",
		});

		expect(updateRecords).toHaveBeenCalledWith({
			tableName: "users",
			updates: [{ rowData: { id: 1, name: "Ada" }, columnName: "name", value: "Grace" }],
			primaryKey: "id",
			db: "shop",
		});
		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalled();
		});
	});

	it("omits the primary key when the table has none", async () => {
		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useUpdateRecord({ tableName: "logs" }), {
			wrapper,
		});

		await result.current.updateRecord({
			rowData: { message: "hi" },
			updates: [{ columnName: "message", value: "hello" }],
		});

		expect(updateRecords).toHaveBeenCalledWith({
			tableName: "logs",
			updates: [{ rowData: { message: "hi" }, columnName: "message", value: "hello" }],
			db: "shop",
		});
	});

	it("rejects empty updates without calling the api", async () => {
		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useUpdateRecord({ tableName: "users" }), {
			wrapper,
		});

		await expect(
			result.current.updateRecord({ rowData: { id: 1 }, updates: [] }),
		).rejects.toThrow("At least one field is required");
		expect(updateRecords).not.toHaveBeenCalled();
	});

	it("propagates api failures to the caller instead of the toast id", async () => {
		updateRecords.mockRejectedValue(new Error("boom"));
		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useUpdateRecord({ tableName: "users" }), {
			wrapper,
		});

		await expect(
			result.current.updateRecord({
				rowData: { id: 1 },
				updates: [{ columnName: "name", value: "Grace" }],
				primaryKey: "id",
			}),
		).rejects.toThrow("boom");
	});
});
