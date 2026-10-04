import type {
	DesktopBridge,
	SaveConnectionInputSchemaType,
	SavedConnectionSchemaType,
} from "@db-studio/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ConnectionsScreen } from "./connections-screen";

// Failure mode: clicking Edit leaves the form on its mount-time values (no id, empty name), so
// "Save changes" is rejected or saves a second connection instead of updating the chosen one.

const bridge = vi.hoisted(() => {
	const saved: SaveConnectionInputSchemaType[] = [];
	const connection: SavedConnectionSchemaType = {
		id: "conn-1",
		name: "Prod",
		color: "#16a34a",
		dbType: "pg",
		summary: "db.internal:5432/app",
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	const desktop = {
		platform: "win32",
		version: "1.0.0",
		getApiBaseUrl: () => null,
		getServerStatus: async () => ({ state: "idle" }),
		onServerStatus: () => () => {},
		listConnections: async () => [connection],
		saveConnection: async (input: SaveConnectionInputSchemaType) => {
			saved.push(input);
			return connection;
		},
	} as unknown as DesktopBridge;
	window.desktop = desktop;
	return { saved };
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));

it("updates the connection picked for editing instead of creating a new one", async () => {
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<ConnectionsScreen />
		</QueryClientProvider>,
	);

	await user.click(await screen.findByRole("button", { name: "Edit Prod" }));
	expect(screen.getByLabelText("Name")).toHaveValue("Prod");

	await user.type(screen.getByLabelText("Connection URL"), "postgres://u:p@db.internal/app");
	await user.click(screen.getByRole("button", { name: "Save changes" }));

	await vi.waitFor(() =>
		expect(bridge.saved).toEqual([
			{
				id: "conn-1",
				name: "Prod",
				color: "#16a34a",
				url: "postgres://u:p@db.internal/app",
			},
		]),
	);
});
