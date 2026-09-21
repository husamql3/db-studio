import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveModeStore } from "./live-mode.store";

describe("useLiveModeStore", () => {
	beforeEach(() => {
		useLiveModeStore.getState().reset();
	});

	it("starts with Live mode disabled and idle", () => {
		const state = useLiveModeStore.getState();
		expect(state.isLive).toBe(false);
		expect(state.status).toBe("idle");
		expect(state.isPulsing).toBe(false);
		expect(state.activeTable).toBeNull();
		expect(state.highlightedRowIds.size).toBe(0);
		expect(state.highlightedCellKeys.size).toBe(0);
	});

	it("enables Live mode and marks healthy status", () => {
		useLiveModeStore.getState().setLive(true, "posts");
		const state = useLiveModeStore.getState();
		expect(state.isLive).toBe(true);
		expect(state.status).toBe("healthy");
		expect(state.activeTable).toBe("posts");
	});

	it("disables Live mode and returns to idle", () => {
		useLiveModeStore.getState().setLive(true, "posts");
		useLiveModeStore.getState().setLive(false);
		const state = useLiveModeStore.getState();
		expect(state.isLive).toBe(false);
		expect(state.status).toBe("idle");
	});

	it("pauses Live mode and marks paused status", () => {
		useLiveModeStore.getState().setLive(true, "posts");
		useLiveModeStore.getState().pauseLive();
		const state = useLiveModeStore.getState();
		expect(state.isLive).toBe(false);
		expect(state.status).toBe("paused");
	});

	it("sets disconnected error status", () => {
		useLiveModeStore.getState().setLive(true, "posts");
		useLiveModeStore.getState().setStatus("disconnected");
		expect(useLiveModeStore.getState().status).toBe("disconnected");
	});

	it("pulses green indicator and auto-clears after timeout", () => {
		vi.useFakeTimers();
		useLiveModeStore.getState().setLive(true, "posts");
		useLiveModeStore.getState().triggerPulse();
		expect(useLiveModeStore.getState().isPulsing).toBe(true);

		vi.advanceTimersByTime(800);
		expect(useLiveModeStore.getState().isPulsing).toBe(false);
		vi.useRealTimers();
	});

	it("sets row and cell highlights and clears after duration", () => {
		vi.useFakeTimers();
		useLiveModeStore.getState().setHighlights(["row-1", "row-2"], ["row-1:title"]);

		expect(useLiveModeStore.getState().isRowHighlighted("row-1")).toBe(true);
		expect(useLiveModeStore.getState().isRowHighlighted("row-2")).toBe(true);
		expect(useLiveModeStore.getState().isRowHighlighted("row-3")).toBe(false);
		expect(useLiveModeStore.getState().isCellHighlighted("row-1", "title")).toBe(true);
		expect(useLiveModeStore.getState().isCellHighlighted("row-1", "body")).toBe(false);

		vi.advanceTimersByTime(1500);
		expect(useLiveModeStore.getState().isRowHighlighted("row-1")).toBe(false);
		expect(useLiveModeStore.getState().isCellHighlighted("row-1", "title")).toBe(false);
		vi.useRealTimers();
	});

	it("clears active highlights when setHighlights is called with empty arrays", () => {
		vi.useFakeTimers();
		useLiveModeStore.getState().setHighlights(["row-1"], ["row-1:title"]);
		expect(useLiveModeStore.getState().isRowHighlighted("row-1")).toBe(true);

		useLiveModeStore.getState().setHighlights([], []);
		expect(useLiveModeStore.getState().isRowHighlighted("row-1")).toBe(false);
		expect(useLiveModeStore.getState().isCellHighlighted("row-1", "title")).toBe(false);
		vi.useRealTimers();
	});

	it("resets all state cleanly", () => {
		useLiveModeStore.getState().setLive(true, "users");
		useLiveModeStore.getState().setHighlights(["1"], ["1:name"]);
		useLiveModeStore.getState().reset();

		const state = useLiveModeStore.getState();
		expect(state.isLive).toBe(false);
		expect(state.status).toBe("idle");
		expect(state.activeTable).toBeNull();
		expect(state.highlightedRowIds.size).toBe(0);
	});
});
