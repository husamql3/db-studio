import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { DataGridState } from "@/hooks/use-data-grid";
import { useLazyRef } from "@/hooks/use-lazy-ref";

export type DataGridStore = {
	subscribe: (callback: () => void) => () => void;
	getState: () => DataGridState;
	setState: <K extends keyof DataGridState>(key: K, value: DataGridState[K]) => void;
	notify: () => void;
	batch: (fn: () => void) => void;
};

function useStore<T>(store: DataGridStore, selector: (state: DataGridState) => T): T {
	const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
	return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export const useTableGridStore = ({ initialState }: { initialState?: DataGridState }) => {
	const listenersRef = useLazyRef(() => new Set<() => void>());
	const stateRef = useLazyRef<DataGridState>(() => {
		return {
			sorting: initialState?.sorting ?? [],
			rowSelection: initialState?.rowSelection ?? {},
			selectionState: {
				selectedCells: new Set(),
				selectionRange: null,
				isSelecting: false,
			},
			focusedCell: null,
			editingCell: null,
			contextMenu: {
				open: false,
				x: 0,
				y: 0,
			},
			searchQuery: "",
			searchMatches: [],
			matchIndex: -1,
			searchOpen: false,
			lastClickedRowIndex: null,
			isScrolling: false,
		};
	});

	const store = useMemo<DataGridStore>(() => {
		let isBatching = false;
		let pendingNotification = false;

		return {
			subscribe: (callback) => {
				listenersRef.current.add(callback);
				return () => listenersRef.current.delete(callback);
			},
			getState: () => stateRef.current,
			setState: (key, value) => {
				if (Object.is(stateRef.current[key], value)) return;
				stateRef.current[key] = value;

				if (isBatching) {
					pendingNotification = true;
				} else {
					if (!pendingNotification) {
						pendingNotification = true;
						queueMicrotask(() => {
							pendingNotification = false;
							store.notify();
						});
					}
				}
			},
			notify: () => {
				for (const listener of listenersRef.current) {
					listener();
				}
			},
			batch: (fn) => {
				if (isBatching) {
					fn();
					return;
				}

				isBatching = true;
				const wasPending = pendingNotification;
				pendingNotification = false;

				try {
					fn();
				} finally {
					isBatching = false;
					if (pendingNotification || wasPending) {
						pendingNotification = false;
						store.notify();
					}
				}
			},
		};
	}, [listenersRef, stateRef]);

	return {
		store,
		focusedCell: useStore(store, (state) => state.focusedCell),
		editingCell: useStore(store, (state) => state.editingCell),
		selectionState: useStore(store, (state) => state.selectionState),
		searchQuery: useStore(store, (state) => state.searchQuery),
		searchMatches: useStore(store, (state) => state.searchMatches),
		matchIndex: useStore(store, (state) => state.matchIndex),
		searchOpen: useStore(store, (state) => state.searchOpen),
		sorting: useStore(store, (state) => state.sorting),
		rowSelection: useStore(store, (state) => state.rowSelection),
		contextMenu: useStore(store, (state) => state.contextMenu),
		isScrolling: useStore(store, (state) => state.isScrolling),
	};
};
