import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useLiveModeStore } from "../../stores/live-mode.store";
import { LiveModeToggle } from "./live-mode-toggle";

describe("LiveModeToggle", () => {
	beforeEach(() => {
		useLiveModeStore.getState().reset();
	});

	it("renders Live button with off indicator by default", () => {
		render(<LiveModeToggle tableName="users" />);

		const button = screen.getByRole("button", { name: "Toggle Live mode" });
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute("aria-pressed", "false");
		expect(screen.getByText("Live")).toBeInTheDocument();

		const dot = screen.getByTestId("live-status-dot");
		expect(dot).toHaveClass("bg-muted-foreground/40");
		expect(screen.queryByTestId("live-pulse-indicator")).not.toBeInTheDocument();
	});

	it("toggles Live mode on click", () => {
		render(<LiveModeToggle tableName="users" />);
		const button = screen.getByRole("button", { name: "Toggle Live mode" });

		fireEvent.click(button);
		expect(useLiveModeStore.getState().isLive).toBe(true);
		expect(button).toHaveAttribute("aria-pressed", "true");

		const dot = screen.getByTestId("live-status-dot");
		expect(dot).toHaveClass("bg-emerald-500");

		fireEvent.click(button);
		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(button).toHaveAttribute("aria-pressed", "false");
	});

	it("displays pulsing indicator when isPulsing is true and healthy", () => {
		useLiveModeStore.getState().setLive(true, "users");
		useLiveModeStore.setState({ isPulsing: true });
		render(<LiveModeToggle tableName="users" />);

		expect(screen.getByTestId("live-pulse-indicator")).toBeInTheDocument();
		expect(screen.getByTestId("live-status-dot")).toHaveClass("bg-emerald-500");
	});

	it("displays paused badge and amber dot when paused during edit", () => {
		useLiveModeStore.getState().setLive(true, "users");
		useLiveModeStore.getState().pauseLive();
		render(<LiveModeToggle tableName="users" />);

		expect(screen.getByText("(Paused)")).toBeInTheDocument();
		const dot = screen.getByTestId("live-status-dot");
		expect(dot).toHaveClass("bg-amber-400");
	});

	it("displays disconnected state when disconnected", () => {
		useLiveModeStore.getState().setLive(true, "users");
		useLiveModeStore.getState().setStatus("disconnected");
		render(<LiveModeToggle tableName="users" />);

		const dot = screen.getByTestId("live-status-dot");
		expect(dot).toHaveClass("bg-amber-500");
	});
});
