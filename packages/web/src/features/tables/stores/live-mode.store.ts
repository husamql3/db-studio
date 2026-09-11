import { create } from "zustand";

export type LiveModeStatus = "idle" | "healthy" | "disconnected" | "paused";

interface LiveModeStore {
	isLive: boolean;
	status: LiveModeStatus;
	isPulsing: boolean;
	activeTable: string | null;
	highlightedRowIds: Set<string>;
	highlightedCellKeys: Set<string>;

	setLive: (isLive: boolean, tableName?: string) => void;
	pauseLive: () => void;
	setStatus: (status: LiveModeStatus) => void;
	triggerPulse: () => void;
	setHighlights: (rowIds: string[], cellKeys: string[], durationMs?: number) => void;
	clearHighlights: () => void;
	isRowHighlighted: (rowId: string) => boolean;
	isCellHighlighted: (rowId: string, columnId: string) => boolean;
	reset: () => void;
}

let pulseTimer: ReturnType<typeof setTimeout> | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

export const useLiveModeStore = create<LiveModeStore>()((set, get) => ({
	isLive: false,
	status: "idle",
	isPulsing: false,
	activeTable: null,
	highlightedRowIds: new Set(),
	highlightedCellKeys: new Set(),

	setLive: (isLive, tableName) => {
		if (!isLive) {
			set({
				isLive: false,
				status: "idle",
				isPulsing: false,
			});
		} else {
			set({
				isLive: true,
				status: "healthy",
				activeTable: tableName ?? get().activeTable,
			});
		}
	},

	pauseLive: () => {
		set({
			isLive: false,
			status: "paused",
			isPulsing: false,
		});
	},

	setStatus: (status) => {
		set({ status });
	},

	triggerPulse: () => {
		if (pulseTimer) {
			clearTimeout(pulseTimer);
		}
		set({ isPulsing: true });
		pulseTimer = setTimeout(() => {
			set({ isPulsing: false });
			pulseTimer = null;
		}, 800);
	},

	setHighlights: (rowIds, cellKeys, durationMs = 1500) => {
		if (rowIds.length === 0 && cellKeys.length === 0) {
			get().clearHighlights();
			return;
		}

		if (highlightTimer) {
			clearTimeout(highlightTimer);
		}

		set({
			highlightedRowIds: new Set(rowIds),
			highlightedCellKeys: new Set(cellKeys),
		});

		highlightTimer = setTimeout(() => {
			set({
				highlightedRowIds: new Set(),
				highlightedCellKeys: new Set(),
			});
			highlightTimer = null;
		}, durationMs);
	},

	clearHighlights: () => {
		if (highlightTimer) {
			clearTimeout(highlightTimer);
			highlightTimer = null;
		}
		set({
			highlightedRowIds: new Set(),
			highlightedCellKeys: new Set(),
		});
	},

	isRowHighlighted: (rowId) => {
		return get().highlightedRowIds.has(rowId);
	},

	isCellHighlighted: (rowId, columnId) => {
		return get().highlightedCellKeys.has(`${rowId}:${columnId}`);
	},

	reset: () => {
		if (pulseTimer) {
			clearTimeout(pulseTimer);
			pulseTimer = null;
		}
		if (highlightTimer) {
			clearTimeout(highlightTimer);
			highlightTimer = null;
		}
		set({
			isLive: false,
			status: "idle",
			isPulsing: false,
			activeTable: null,
			highlightedRowIds: new Set(),
			highlightedCellKeys: new Set(),
		});
	},
}));
