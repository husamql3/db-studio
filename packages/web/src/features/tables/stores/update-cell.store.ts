import { create } from "zustand";
import type { EditScope } from "@/types/table.type";
import { stableStringify } from "../utils/table-diff";

export type CellUpdate = {
	scope: string;
	rowData: Record<string, unknown>; // The entire row data
	columnName: string; // The column identifier
	newValue: unknown; // The new value
	originalValue: unknown; // The original value for comparison
};

type UpdateCellStore = {
	updates: Map<string, CellUpdate>;
	setUpdate: (
		rowData: Record<string, unknown>,
		columnName: string,
		newValue: unknown,
		originalValue: unknown,
		scope?: EditScope,
	) => void;
	/** Without a scope, drops every draft (a connection switch). */
	clearUpdates: (scopeId?: string) => void;
	clearUpdate: (
		rowData: Record<string, unknown>,
		columnName: string,
		scope?: EditScope,
	) => void;
	/** Drops exactly these drafts; a cell edited again since then keeps its newer draft. */
	removeUpdates: (updates: CellUpdate[]) => void;
	getUpdates: (scopeId: string) => CellUpdate[];
	getUpdate: (
		rowData: Record<string, unknown>,
		columnName: string,
		scope?: EditScope,
	) => CellUpdate | null;
	getUpdateCount: (scopeId: string) => number;
};

const GLOBAL_SCOPE: EditScope = { id: "global", keyColumns: [] };

const getCellKey = (
	rowData: Record<string, unknown>,
	columnName: string,
	scope = GLOBAL_SCOPE,
): string =>
	// Keeps each key value's type, so a MongoDB `_id` of 1 and one of "1" stay two rows.
	stableStringify([
		scope.id,
		scope.keyColumns.length > 0
			? scope.keyColumns.map((column) => rowData[column])
			: (rowData.id ?? rowData._id ?? rowData),
		columnName,
	]);

export const useUpdateCellStore = create<UpdateCellStore>()((set, get) => ({
	updates: new Map(),

	setUpdate: (rowData, columnName, newValue, originalValue, scope = GLOBAL_SCOPE) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			const key = getCellKey(rowData, columnName, scope);

			// If the new value equals the original value, remove the update
			if (newValue === originalValue) {
				newUpdates.delete(key);
			} else {
				newUpdates.set(key, {
					scope: scope.id,
					rowData,
					columnName,
					newValue,
					originalValue,
				});
			}
			return { updates: newUpdates };
		});
	},

	clearUpdates: (scopeId) =>
		set((state) => ({
			updates: new Map(
				scopeId === undefined
					? []
					: [...state.updates].filter(([, update]) => update.scope !== scopeId),
			),
		})),

	clearUpdate: (rowData, columnName, scope) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			newUpdates.delete(getCellKey(rowData, columnName, scope));
			return { updates: newUpdates };
		});
	},

	removeUpdates: (updates) => {
		const submitted = new Set(updates);
		set((state) => ({
			updates: new Map([...state.updates].filter(([, update]) => !submitted.has(update))),
		}));
	},

	getUpdates: (scopeId) =>
		Array.from(get().updates.values()).filter((update) => update.scope === scopeId),

	// Every visible cell asks on every render; skip building its key while nothing is pending.
	getUpdate: (rowData, columnName, scope) => {
		const { updates } = get();
		if (updates.size === 0) return null;
		return updates.get(getCellKey(rowData, columnName, scope)) ?? null;
	},

	getUpdateCount: (scopeId) => get().getUpdates(scopeId).length,
}));
