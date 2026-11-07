import { TooltipProvider } from "@db-studio/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import { fakeServer } from "../../../../tests/api";
import { column } from "../../../../tests/column";
import { AddRecordForm } from "./add-record-form";

vi.mock("@/hooks/use-table-schema-name", () => ({ useTableSchemaName: () => undefined }));

vi.mock("@/lib/logger", () => ({
	logger: { request: vi.fn(), response: vi.fn(), error: vi.fn() },
}));

vi.mock(import("nuqs"), async (importOriginal) => ({
	...(await importOriginal()),
	useQueryState: () => [null, vi.fn()],
}));

describe("AddRecordForm", () => {
	// An emptied number field and the date picker's NULL preset both sent "", which a number or
	// date column rejects. Only a text column keeps "" as the empty string.
	it("creates emptied number and date fields as NULL and an emptied text field as empty", async () => {
		useDatabaseStore.setState({ selectedDatabase: "shop", dbType: "pg" });

		const sent = fakeServer({
			"GET /tables/users/columns": {
				data: {
					data: [
						column("name"),
						column("age", { dataType: "number", dataTypeLabel: "int" }),
						column("created", { dataType: "date", dataTypeLabel: "date" }),
					],
				},
			},
			"POST /records": { data: { data: "Record inserted" } },
		});

		useOverlayStore.setState({ openOverlays: [] });
		useOverlayStore.getState().openOverlay("records.add-record");

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<AddRecordForm tableName="users" />
				</TooltipProvider>
			</QueryClientProvider>,
		);

		const user = userEvent.setup();
		const name = await screen.findByLabelText("name");
		await user.type(name, "x");
		await user.clear(name);
		const age = screen.getByLabelText("age");
		await user.type(age, "5");
		await user.clear(age);
		await user.click(screen.getByRole("button", { name: "Select a date" }));
		await user.click(await screen.findByRole("button", { name: "NULL" }));
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(sent.filter((request) => request.method === "POST")).toHaveLength(1),
		);

		expect(sent.find((request) => request.method === "POST")?.body).toEqual({
			tableName: "users",
			data: { name: "", age: null, created: null },
		});
	});
});
