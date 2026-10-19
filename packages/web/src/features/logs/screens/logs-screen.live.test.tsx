import type { ServerLogsResult } from "@db-studio/shared/types";
import { TooltipProvider } from "@db-studio/ui/tooltip";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogsScreen } from "./logs-screen";

/*
 * Failure modes:
 * - Scrolling up without a wheel (scrollbar drag, keyboard, touch) leaves Live on, so the next
 *   entry pulls the view back to the bottom.
 * - A scroll that ends on the newest line, such as Live's own follow, pauses Live.
 */

const serverLogs: ServerLogsResult = {
	available: true,
	source: "pg_log",
	entries: ["first", "second", "third"].map((message, i) => ({
		ts: `2026-10-19T10:00:0${i}.000Z`,
		level: "info",
		rawLevel: "LOG",
		message,
		detail: {},
	})),
};

vi.mock("../hooks/use-server-logs", () => ({
	useServerLogs: () => ({
		serverLogs,
		isLoadingServerLogs: false,
		isRefetchingServerLogs: false,
		errorServerLogs: null,
		refetchServerLogs: () => {},
	}),
}));

/** Scrolls the log to `scrollTop` in a 1000px-tall log shown 200px at a time. */
const scrollLogTo = (scrollTop: number) => {
	const scroller = screen.getByRole("button", { name: /first/ }).closest(".overflow-auto");
	if (!scroller) throw new Error("log scroller not found");
	Object.defineProperties(scroller, {
		scrollHeight: { configurable: true, value: 1000 },
		clientHeight: { configurable: true, value: 200 },
	});
	scroller.scrollTop = scrollTop;
	fireEvent.scroll(scroller);
};

describe("LogsScreen Live", () => {
	beforeEach(() => {
		Element.prototype.scrollTo = vi.fn();
		render(
			<TooltipProvider>
				<LogsScreen />
			</TooltipProvider>,
		);
	});

	it("pauses when the view leaves the newest line without a wheel", () => {
		scrollLogTo(0);

		expect(screen.getByRole("button", { name: /Jump to latest/ })).toBeInTheDocument();
	});

	it("stays on while the view rests on the newest line", () => {
		scrollLogTo(800);

		expect(screen.queryByRole("button", { name: /Jump to latest/ })).not.toBeInTheDocument();
	});
});
