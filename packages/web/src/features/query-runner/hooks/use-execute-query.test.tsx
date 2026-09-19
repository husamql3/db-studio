import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExecuteQuery } from "./use-execute-query";

const mocks = vi.hoisted(() => ({
	executeQueryRequest: vi.fn(),
}));

vi.mock("@/shared/api", () => ({ executeQuery: mocks.executeQueryRequest }));
vi.mock("@/lib/posthog", () => ({ posthogAnalytics: { capture: vi.fn() } }));
vi.mock("@/stores/database.store", () => ({
	useDatabaseStore: () => ({ selectedDatabase: "app", dbType: "pg" }),
}));

describe("query execution", () => {
	beforeEach(() => vi.clearAllMocks());

	it("exposes a failed query through mutation state without rejecting its caller", async () => {
		const failure = new Error("Database connection failed");
		mocks.executeQueryRequest.mockRejectedValue(failure);
		const queryClient = new QueryClient({
			defaultOptions: { mutations: { retry: false } },
		});
		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => useExecuteQuery(), { wrapper });

		let execution!: ReturnType<typeof result.current.executeQuery>;
		act(() => {
			execution = result.current.executeQuery({ query: "select 1" });
		});

		await expect(execution).resolves.toBeUndefined();
		await waitFor(() => expect(result.current.executeQueryError).toBe(failure));
	});
});
