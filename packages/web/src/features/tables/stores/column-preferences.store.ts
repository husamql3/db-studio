import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ColumnPrefs = {
	order: string[];
	hidden: string[];
};

export type ColumnPrefKeyParts = {
	dbType: string;
	database: string;
	tableName: string;
};

export const EMPTY_COLUMN_PREFS: ColumnPrefs = { order: [], hidden: [] };

export const sameColumnPrefKey = (a: ColumnPrefKeyParts, b: ColumnPrefKeyParts): boolean =>
	a.dbType === b.dbType && a.database === b.database && a.tableName === b.tableName;

/** Deep equality for prefs — used to skip no-op writes and state updates. */
export const sameColumnPrefs = (a: ColumnPrefs, b: ColumnPrefs): boolean =>
	a.order.length === b.order.length &&
	a.hidden.length === b.hidden.length &&
	a.order.every((name, i) => name === b.order[i]) &&
	a.hidden.every((name, i) => name === b.hidden[i]);

/** JSON-encoded so a colon inside a database or table name cannot collide. */
export const makeColumnPrefKey = ({
	dbType,
	database,
	tableName,
}: ColumnPrefKeyParts): string => JSON.stringify([dbType, database, tableName]);

const sanitize = (value: unknown): ColumnPrefs => {
	const raw = (value ?? {}) as Partial<ColumnPrefs>;
	const order = Array.isArray(raw.order) ? raw.order.filter((c) => typeof c === "string") : [];
	const hidden = Array.isArray(raw.hidden)
		? raw.hidden.filter((c) => typeof c === "string")
		: [];
	return { order, hidden };
};

const sanitizeAll = (value: unknown): Record<string, ColumnPrefs> => {
	if (!value || typeof value !== "object") return {};
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, prefs]) => [
			key,
			sanitize(prefs),
		]),
	);
};

type ColumnPreferencesStore = {
	prefsByTable: Record<string, ColumnPrefs>;
	setColumnPrefs: (parts: ColumnPrefKeyParts, prefs: ColumnPrefs) => void;
	clearColumnPrefs: (parts: ColumnPrefKeyParts) => void;
};

export const useColumnPreferencesStore = create<ColumnPreferencesStore>()(
	persist(
		(set) => ({
			prefsByTable: {},

			setColumnPrefs: (parts, prefs) =>
				set((state) => ({
					prefsByTable: {
						...state.prefsByTable,
						[makeColumnPrefKey(parts)]: sanitize(prefs),
					},
				})),

			clearColumnPrefs: (parts) =>
				set((state) => {
					const { [makeColumnPrefKey(parts)]: _removed, ...rest } = state.prefsByTable;
					return { prefsByTable: rest };
				}),
		}),
		{
			name: "dbstudio-column-preferences",
			partialize: (state) => ({ prefsByTable: state.prefsByTable }),
			// Stored payloads can be stale or hand-edited, so never trust their shape.
			merge: (persisted, current) => ({
				...current,
				prefsByTable: sanitizeAll(
					(persisted as { prefsByTable?: unknown } | undefined)?.prefsByTable,
				),
			}),
		},
	),
);

/** Stored preferences for one table, or the empty defaults. */
export const getColumnPrefs = (parts: ColumnPrefKeyParts): ColumnPrefs =>
	useColumnPreferencesStore.getState().prefsByTable[makeColumnPrefKey(parts)] ??
	EMPTY_COLUMN_PREFS;

/**
 * Reconcile saved prefs against the live schema:
 * - dropped columns that no longer exist
 * - appended new columns (in schema order) to the end of the saved order
 * - dropped hidden entries that no longer exist
 * The result always contains every schema column exactly once, so the table
 * never loses a column because of stale preferences.
 */
export const reconcileColumnPrefs = (
	schemaCols: string[],
	prefs: ColumnPrefs,
): ColumnPrefs => {
	const schemaSet = new Set(schemaCols);
	const seen = new Set<string>();
	const order: string[] = [];
	for (const name of prefs.order) {
		if (schemaSet.has(name) && !seen.has(name)) {
			order.push(name);
			seen.add(name);
		}
	}
	for (const name of schemaCols) {
		if (!seen.has(name)) {
			order.push(name);
			seen.add(name);
		}
	}
	const hidden = prefs.hidden.filter(
		(name) => schemaSet.has(name) && typeof name === "string",
	);
	return { order, hidden };
};

/** Applied view: schema columns ordered by prefs and filtered by hidden. */
export const applyColumnPrefs = (schemaCols: string[], prefs: ColumnPrefs): string[] => {
	const { order, hidden } = reconcileColumnPrefs(schemaCols, prefs);
	const hiddenSet = new Set(hidden);
	const ordered = order.filter((name) => !hiddenSet.has(name));
	return [...ordered].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

/**
 * Move a column relative to another target column in the order list.
 * Safe against index mismatches when lists are filtered by search.
 */
export const reorderColumns = (
	order: string[],
	sourceCol: string,
	targetCol: string,
	position?: "before" | "after",
): string[] => {
	if (sourceCol === targetCol) return order;
	const fromIndex = order.indexOf(sourceCol);
	const targetIndex = order.indexOf(targetCol);
	if (fromIndex === -1 || targetIndex === -1) return order;

	const next = [...order];
	next.splice(fromIndex, 1);
	const newTargetIndex = next.indexOf(targetCol);
	const insertIndex =
		(position ?? (fromIndex < targetIndex ? "after" : "before")) === "after"
			? newTargetIndex + 1
			: newTargetIndex;
	next.splice(insertIndex, 0, sourceCol);
	return next;
};
