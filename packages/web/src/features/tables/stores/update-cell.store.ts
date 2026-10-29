import { create } from "zustand";
import type { EditScope } from "@/types/table.type";
import { stableStringify } from "../utils/table-diff";

/** A pending value meaning "set this cell to its column default"; compared by identity. */
export const CELL_DEFAULT = Object.freeze({ default: true });

export type CellUpdate = {
	scope: string;
	rowData: Record<string, unknown>; // The entire row data
	columnName: string; // The column identifier
	newValue: unknown; // The new value
	originalValue: unknown; // The original value for comparison
};

type Change = [key: string, update: CellUpdate | undefined];
/** One undoable edit: what its cells held before it. */
type HistoryStep = { scope: string; previous: Change[] };
export type StagedEdit = {
	rowData: Record<string, unknown>;
	columnName: string;
	newValue: unknown;
	originalValue: unknown;
};

type UpdateCellStore = {
	updates: Map<string, CellUpdate>;
	history: HistoryStep[];
	setUpdate: (
		rowData: Record<string, unknown>,
		columnName: string,
		newValue: unknown,
		originalValue: unknown,
		scope?: EditScope,
	) => void;
	/** Stages several edits (a paste) as one undo step. */
	setUpdates: (edits: StagedEdit[], scope?: EditScope) => void;
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
	/** Reverts the scope's latest edit, revert or clear; returns how many cells changed. */
	undo: (scopeId: string) => number;
};

const GLOBAL_SCOPE: EditScope = { id: "global", keyColumns: [] };

/** The key values that identify a row's drafts within a scope. */
export const getRowIdentity = (rowData: Record<string, unknown>, scope = GLOBAL_SCOPE) =>
	scope.keyColumns.length > 0
		? scope.keyColumns.map((column) => rowData[column])
		: (rowData.id ?? rowData._id ?? rowData);

const getCellKey = (
	rowData: Record<string, unknown>,
	columnName: string,
	scope = GLOBAL_SCOPE,
): string =>
	// Keeps each key value's type, so a MongoDB `_id` of 1 and one of "1" stay two rows.
	stableStringify([scope.id, getRowIdentity(rowData, scope), columnName]);

const toChange = (
	{ rowData, columnName, newValue, originalValue }: StagedEdit,
	scope: EditScope,
): Change => [
	getCellKey(rowData, columnName, scope),
	// An edit back to the original value drops the draft.
	newValue === originalValue
		? undefined
		: { scope: scope.id, rowData, columnName, newValue, originalValue },
];

/** Applies the changes as one undo step; a step that changes nothing is not recorded. */
const commit = (
	state: Pick<UpdateCellStore, "updates" | "history">,
	scope: string,
	changes: Change[],
) => {
	const updates = new Map(state.updates);
	const previous: Change[] = [];
	for (const [key, update] of changes) {
		previous.push([key, updates.get(key)]);
		if (update) updates.set(key, update);
		else updates.delete(key);
	}
	if (previous.every(([, before], i) => before === changes[i][1])) return state;
	return { updates, history: [...state.history, { scope, previous }] };
};

export const useUpdateCellStore = create<UpdateCellStore>()((set, get) => ({
	updates: new Map(),
	history: [],

	setUpdate: (rowData, columnName, newValue, originalValue, scope = GLOBAL_SCOPE) =>
		set((state) =>
			commit(state, scope.id, [
				toChange({ rowData, columnName, newValue, originalValue }, scope),
			]),
		),

	setUpdates: (edits, scope = GLOBAL_SCOPE) =>
		set((state) =>
			commit(
				state,
				scope.id,
				edits.map((edit) => toChange(edit, scope)),
			),
		),

	clearUpdates: (scopeId) =>
		set((state) =>
			scopeId === undefined
				? { updates: new Map(), history: [] }
				: commit(
						state,
						scopeId,
						[...state.updates]
							.filter(([, update]) => update.scope === scopeId)
							.map(([key]) => [key, undefined]),
					),
		),

	clearUpdate: (rowData, columnName, scope = GLOBAL_SCOPE) =>
		set((state) =>
			commit(state, scope.id, [[getCellKey(rowData, columnName, scope), undefined]]),
		),

	// Saved drafts are gone for good: undo must not bring them back over the saved values.
	removeUpdates: (updates) => {
		const submitted = new Set(updates);
		const scopes = new Set(updates.map((update) => update.scope));
		set((state) => ({
			updates: new Map([...state.updates].filter(([, update]) => !submitted.has(update))),
			history: state.history.filter((step) => !scopes.has(step.scope)),
		}));
	},

	undo: (scopeId) => {
		const { updates, history } = get();
		const index = history.map((step) => step.scope).lastIndexOf(scopeId);
		if (index < 0) return 0;
		const next = new Map(updates);
		const { previous } = history[index];
		// Backwards, so a cell changed twice in one step ends at its first value.
		for (const [key, update] of [...previous].reverse()) {
			if (update) next.set(key, update);
			else next.delete(key);
		}
		set({ updates: next, history: history.filter((_, i) => i !== index) });
		return new Set(previous.map(([key]) => key)).size;
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
