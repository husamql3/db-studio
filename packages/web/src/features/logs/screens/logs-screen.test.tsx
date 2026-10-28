import type { ServerLogEntrySchemaType, ServerLogsResult } from "@db-studio/shared/types";
import { TooltipProvider } from "@db-studio/ui/tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogsScreen } from "./logs-screen";

/*
 * Failure modes:
 * - Two entries that share a timestamp and message (a Redis command repeated within one
 *   second) collapse into one identity, so one click expands both.
 * - A new entry identical to the newest one does not move the view to it while Live.
 */

let serverLogs: ServerLogsResult;

vi.mock("../hooks/use-server-logs", () => ({
	useServerLogs: () => ({
		serverLogs,
		isLoadingServerLogs: false,
		isRefetchingServerLogs: false,
		errorServerLogs: null,
		refetchServerLogs: () => {},
	}),
}));

const slowlogEntry = (id: string): ServerLogEntrySchemaType => ({
	ts: "2026-10-19T10:00:00.000Z",
	level: "info",
	rawLevel: "slowlog",
	message: "KEYS *",
	durationMs: 12,
	detail: { id },
});

const showEntries = (ids: string[]) => {
	serverLogs = { available: true, source: "SLOWLOG", entries: ids.map(slowlogEntry) };
};

const renderScreen = () =>
	render(
		<TooltipProvider>
			<LogsScreen />
		</TooltipProvider>,
	);

describe("LogsScreen", () => {
	beforeEach(() => {
		Element.prototype.scrollTo = vi.fn();
	});

	it("expands only the clicked one of two repeated commands", () => {
		showEntries(["101", "102"]);
		renderScreen();

		const lines = screen.getAllByRole("button", { name: /KEYS \*/ });
		expect(lines).toHaveLength(2);
		fireEvent.click(lines[0]);

		expect(lines.map((line) => line.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
		expect(screen.getByText("101")).toBeInTheDocument();
		expect(screen.queryByText("102")).not.toBeInTheDocument();
	});

	it("follows a new entry that repeats the newest command", () => {
		showEntries(["101"]);
		const { rerender } = renderScreen();
		const scrollTo = vi.mocked(Element.prototype.scrollTo);
		scrollTo.mockClear();

		showEntries(["101", "102"]);
		rerender(
			<TooltipProvider>
				<LogsScreen />
			</TooltipProvider>,
		);

		expect(scrollTo).toHaveBeenCalledTimes(1);
	});
});
