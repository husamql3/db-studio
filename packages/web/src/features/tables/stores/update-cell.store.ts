import { create } from "zustand";

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
		scope?: string,
	) => void;
	clearUpdates: () => void;
	clearUpdate: (rowData: Record<string, unknown>, columnName: string, scope?: string) => void;
	getUpdates: () => CellUpdate[];
	getUpdate: (
		rowData: Record<string, unknown>,
		columnName: string,
		scope?: string,
	) => CellUpdate | null;
	hasUpdate: (rowData: Record<string, unknown>, columnName: string, scope?: string) => boolean;
	hasAnyUpdates: () => boolean;
	getUpdateCount: () => number;
};

const stableStringify = (value: unknown): string => {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`;
};

const getCellKey = (
	rowData: Record<string, unknown>,
	columnName: string,
	scope = "global",
): string => {
	const rowId = rowData.id ?? rowData._id ?? stableStringify(rowData);
	return stableStringify([scope, rowId, columnName]);
};

export const useUpdateCellStore = create<UpdateCellStore>()((set, get) => ({
	updates: new Map(),

	setUpdate: (rowData, columnName, newValue, originalValue, scope) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			const key = getCellKey(rowData, columnName, scope);

			// If the new value equals the original value, remove the update
			if (newValue === originalValue) {
				newUpdates.delete(key);
			} else {
				newUpdates.set(key, {
					scope: scope ?? "global",
					rowData,
					columnName,
					newValue,
					originalValue,
				});
			}
			return { updates: newUpdates };
		});
	},

	clearUpdates: () => set({ updates: new Map() }),

	clearUpdate: (rowData, columnName, scope) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			newUpdates.delete(getCellKey(rowData, columnName, scope));
			return { updates: newUpdates };
		});
	},

	getUpdates: () => Array.from(get().updates.values()),

	getUpdate: (rowData, columnName, scope) => {
		return get().updates.get(getCellKey(rowData, columnName, scope)) ?? null;
	},

	hasUpdate: (rowData, columnName, scope) => {
		return get().updates.has(getCellKey(rowData, columnName, scope));
	},

	hasAnyUpdates: () => get().updates.size > 0,

	getUpdateCount: () => get().updates.size,
}));
