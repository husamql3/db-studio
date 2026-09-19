import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROW_DETAILS_OPEN_DELAY, useDelayedRowOpen } from "./use-delayed-row-open";

describe("useDelayedRowOpen", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs the action after the delay", () => {
		const action = vi.fn();
		const { result } = renderHook(() => useDelayedRowOpen());

		act(() => {
			result.current.schedule(action);
		});
		expect(action).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(ROW_DETAILS_OPEN_DELAY);
		});
		expect(action).toHaveBeenCalledTimes(1);
	});

	it("cancels a pending action on double-click", () => {
		const action = vi.fn();
		const { result } = renderHook(() => useDelayedRowOpen());

		act(() => {
			result.current.schedule(action);
			result.current.cancel();
			vi.advanceTimersByTime(ROW_DETAILS_OPEN_DELAY);
		});
		expect(action).not.toHaveBeenCalled();
	});

	it("restarts the delay when scheduled twice", () => {
		const action = vi.fn();
		const { result } = renderHook(() => useDelayedRowOpen());

		act(() => {
			result.current.schedule(action);
			vi.advanceTimersByTime(ROW_DETAILS_OPEN_DELAY - 50);
			result.current.schedule(action);
			vi.advanceTimersByTime(ROW_DETAILS_OPEN_DELAY - 50);
		});
		expect(action).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(50);
		});
		expect(action).toHaveBeenCalledTimes(1);
	});
});
