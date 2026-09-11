import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { useLiveModeStore } from "../stores/live-mode.store";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { useLiveTable } from "./use-live-table";

describe("useLiveTable", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		useDatabaseStore.setState({ dbType: "pg", selectedDatabase: "default_db" });
		useLiveModeStore.getState().reset();
		useUpdateCellStore.getState().clearUpdates();
		useOverlayStore.getState().closeAllOverlays();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not poll when Live mode is disabled", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		vi.advanceTimersByTime(3000);
		expect(refetch).not.toHaveBeenCalled();
	});

	it("polls every 1 second when Live mode is enabled", async () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		const { result } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			result.current.toggleLive();
		});

		expect(result.current.isLive).toBe(true);
		expect(refetch).toHaveBeenCalledTimes(1); // Immediate on toggle

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(refetch).toHaveBeenCalledTimes(2);

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(refetch).toHaveBeenCalledTimes(3);
	});

	it("does not enable or poll if database does not support liveMode", () => {
		useDatabaseStore.setState({ dbType: "mysql" });
		const refetch = vi.fn().mockResolvedValue({ isError: false });

		const { result } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		expect(result.current.canLiveMode).toBe(false);

		act(() => {
			result.current.toggleLive();
		});

		expect(result.current.isLive).toBe(false);
		vi.advanceTimersByTime(2000);
		expect(refetch).not.toHaveBeenCalled();
	});

	it("pauses Live mode when user begins cell editing", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		let isEditingCell = false;

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
				isEditingCell,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});
		expect(useLiveModeStore.getState().isLive).toBe(true);

		isEditingCell = true;
		act(() => {
			rerender();
		});

		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(useLiveModeStore.getState().status).toBe("paused");
	});

	it("pauses Live mode when pending cell updates exist", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});
		expect(useLiveModeStore.getState().isLive).toBe(true);

		act(() => {
			useUpdateCellStore.getState().setUpdate({ id: 1 }, "name", "New Name", "Old Name");
		});
		act(() => {
			rerender();
		});

		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(useLiveModeStore.getState().status).toBe("paused");
	});

	it("pauses Live mode when a record sheet overlay is opened", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});

		act(() => {
			useOverlayStore.getState().openOverlay("records.add-record");
		});
		act(() => {
			rerender();
		});

		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(useLiveModeStore.getState().status).toBe("paused");
	});

	it("pulses and sets highlights when data changes during Live mode", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		let rows: TableRecord[] = [{ id: 1, name: "Alice" }];

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: rows,
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});

		rows = [
			{ id: 1, name: "Alice Updated" },
			{ id: 2, name: "Bob Inserted" },
		];
		rerender();

		expect(useLiveModeStore.getState().isPulsing).toBe(true);
		expect(useLiveModeStore.getState().isRowHighlighted("2")).toBe(true);
		expect(useLiveModeStore.getState().isCellHighlighted("1", "name")).toBe(true);
	});

	it("cleans up Live state on unmount", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		const { unmount } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});

		unmount();
		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(useLiveModeStore.getState().status).toBe("idle");
	});

	it("stops polling when tab is hidden and polls immediately when tab becomes visible", async () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		const { result } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			result.current.toggleLive();
		});
		expect(refetch).toHaveBeenCalledTimes(1);

		// Hide tab
		Object.defineProperty(document, "hidden", { value: true, configurable: true });

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});
		// Should not have polled while hidden
		expect(refetch).toHaveBeenCalledTimes(1);

		// Tab becomes visible again
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		// Should poll immediately upon becoming visible
		expect(refetch).toHaveBeenCalledTimes(2);

		// And resume 1s interval
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(refetch).toHaveBeenCalledTimes(3);
	});

	it("cleans up Live state when database switches", () => {
		const refetch = vi.fn().mockResolvedValue({ isError: false });
		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});
		expect(useLiveModeStore.getState().isLive).toBe(true);

		act(() => {
			useDatabaseStore.setState({ selectedDatabase: "other_db" });
		});
		act(() => {
			rerender();
		});

		expect(useLiveModeStore.getState().isLive).toBe(false);
		expect(useLiveModeStore.getState().status).toBe("idle");
	});

	it("ignores in-flight poll completion after editing pauses Live mode", async () => {
		let resolvePoll: ((value: unknown) => void) | null = null;
		const refetch = vi.fn().mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvePoll = resolve;
				}),
		);
		let isEditingCell = false;

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
				isEditingCell,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(refetch).toHaveBeenCalled();

		isEditingCell = true;
		act(() => {
			rerender();
		});
		expect(useLiveModeStore.getState().status).toBe("paused");
		expect(useLiveModeStore.getState().isLive).toBe(false);

		await act(async () => {
			resolvePoll?.({ isError: false });
		});

		expect(useLiveModeStore.getState().status).toBe("paused");
	});

	it("ignores in-flight poll completion after database switch", async () => {
		let resolvePoll: ((value: unknown) => void) | null = null;
		const refetch = vi.fn().mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvePoll = resolve;
				}),
		);

		const { rerender } = renderHook(() =>
			useLiveTable({
				tableName: "users",
				tableDataRows: [],
				refetchTableData: refetch,
			}),
		);

		act(() => {
			useLiveModeStore.getState().setLive(true, "users");
		});

		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(refetch).toHaveBeenCalled();

		act(() => {
			useDatabaseStore.setState({ selectedDatabase: "other_db" });
		});
		act(() => {
			rerender();
		});
		expect(useLiveModeStore.getState().status).toBe("idle");

		await act(async () => {
			resolvePoll?.({ isError: false });
		});

		expect(useLiveModeStore.getState().status).toBe("idle");
	});
});
