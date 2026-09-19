import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDatabaseStore } from "@/stores/database.store";
import {
	applyColumnPrefs,
	type ColumnPrefs,
	clearColumnPrefs,
	loadColumnPrefs,
	reconcileColumnPrefs,
	reorderColumns,
	sameColumnPrefKey,
	sameColumnPrefs,
	saveColumnPrefs,
	subscribeColumnPrefsChanged,
} from "../stores/column-preferences.store";

export const useColumnPreferences = ({
	tableName,
	tableCols,
}: {
	tableName: string;
	tableCols?: ColumnInfoSchemaType[];
}) => {
	const { dbType, selectedDatabase } = useDatabaseStore();

	const schemaCols = useMemo(() => (tableCols ?? []).map((c) => c.columnName), [tableCols]);

	// Content-based key: callers (or mocked hooks) may hand back a new array
	// identity every render, so effect deps must never use `tableCols` directly.
	const schemaKey = useMemo(() => schemaCols.join("\n"), [schemaCols]);

	const key = useMemo(
		() => ({ dbType: dbType ?? "", database: selectedDatabase ?? "", tableName }),
		[dbType, selectedDatabase, tableName],
	);

	const [prefs, setPrefs] = useState<ColumnPrefs>(() => loadColumnPrefs(key));

	// Re-read stored prefs whenever the scope (dbType/database/table) changes.
	useEffect(() => {
		setPrefs(loadColumnPrefs(key));
	}, [key]);

	// Stay in sync with writes from other useColumnPreferences instances
	// (e.g. the menu) scoped to the same dbType/database/table.
	useEffect(
		() =>
			subscribeColumnPrefsChanged((changed) => {
				if (sameColumnPrefKey(changed, key)) setPrefs(loadColumnPrefs(key));
			}),
		[key],
	);

	// Reconcile on schema change: new columns appended, removed ones pruned.
	// `schemaKey` keeps this stable across re-renders that only change array
	// identity; the no-op guard breaks any save→setPrefs→re-render cycle.
	const schemaColsRef = useRef(schemaCols);
	useLayoutEffect(() => {
		schemaColsRef.current = schemaCols;
	}, [schemaCols]);
	useEffect(() => {
		if (schemaKey.length === 0) return;
		const current = loadColumnPrefs(key);
		const reconciled = reconcileColumnPrefs(schemaColsRef.current, current);
		if (sameColumnPrefs(current, reconciled)) {
			setPrefs((prev) => (sameColumnPrefs(prev, reconciled) ? prev : reconciled));
			return;
		}
		saveColumnPrefs(key, reconciled);
		setPrefs(reconciled);
	}, [key, schemaKey]);

	// Writes go through the same no-op guard: an update that reconciles to the
	// current state does not notify subscribers or re-render.
	const update = useCallback(
		(next: ColumnPrefs) => {
			const reconciled = reconcileColumnPrefs(schemaColsRef.current, next);
			if (sameColumnPrefs(loadColumnPrefs(key), reconciled)) {
				setPrefs((prev) => (sameColumnPrefs(prev, reconciled) ? prev : reconciled));
				return;
			}
			saveColumnPrefs(key, reconciled);
			setPrefs(reconciled);
		},
		[key],
	);

	const toggleColumn = useCallback(
		(columnName: string) => {
			const current = loadColumnPrefs(key);
			const reconciled = reconcileColumnPrefs(schemaColsRef.current, current);
			const hiddenSet = new Set(reconciled.hidden);
			if (hiddenSet.has(columnName)) {
				hiddenSet.delete(columnName);
			} else {
				hiddenSet.add(columnName);
			}
			update({ ...reconciled, hidden: [...hiddenSet] });
		},
		[key, update],
	);

	const moveColumn = useCallback(
		(columnName: string, direction: -1 | 1, scopeCols?: string[]) => {
			const current = loadColumnPrefs(key);
			const reconciled = reconcileColumnPrefs(schemaColsRef.current, current);
			const list = scopeCols ?? reconciled.order;
			const index = list.indexOf(columnName);
			const targetIndex = index + direction;
			if (index === -1 || targetIndex < 0 || targetIndex >= list.length) return;
			const targetCol = list[targetIndex];
			const order = reorderColumns(
				reconciled.order,
				columnName,
				targetCol,
				direction === -1 ? "before" : "after",
			);
			update({ ...reconciled, order });
		},
		[key, update],
	);

	const reorderColumn = useCallback(
		(sourceCol: string, targetCol: string, position?: "before" | "after") => {
			const current = loadColumnPrefs(key);
			const reconciled = reconcileColumnPrefs(schemaColsRef.current, current);
			const order = reorderColumns(reconciled.order, sourceCol, targetCol, position);
			update({ ...reconciled, order });
		},
		[key, update],
	);

	// Show all makes every database column visible while preserving column order
	const showAllColumns = useCallback(() => {
		const current = loadColumnPrefs(key);
		const reconciled = reconcileColumnPrefs(schemaColsRef.current, current);
		update({ ...reconciled, hidden: [] });
	}, [key, update]);

	// Reset restores original schema order and default visibility
	const resetColumns = useCallback(() => {
		clearColumnPrefs(key);
		setPrefs({ order: [], hidden: [] });
	}, [key]);

	// Full reconciled order (visible + hidden in place) — what the menu renders.
	const orderedColumns = useMemo(
		() => reconcileColumnPrefs(schemaCols, prefs).order,
		[schemaCols, prefs],
	);

	// Applied view: visible columns in display order — what the table renders.
	const visibleColumns = useMemo(
		() => applyColumnPrefs(schemaCols, prefs),
		[schemaCols, prefs],
	);

	return {
		orderedColumns,
		visibleColumns,
		toggleColumn,
		moveColumn,
		reorderColumn,
		showAllColumns,
		resetColumns,
	};
};
