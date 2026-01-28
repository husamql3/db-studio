import { create } from "zustand";

export type CellUpdate = {
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
	) => void;
	clearUpdates: () => void;
	clearUpdate: (rowData: Record<string, unknown>, columnName: string) => void;
	getUpdates: () => CellUpdate[];
	getUpdate: (rowData: Record<string, unknown>, columnName: string) => CellUpdate | null;
	hasUpdate: (rowData: Record<string, unknown>, columnName: string) => boolean;
	hasAnyUpdates: () => boolean;
	getUpdateCount: () => number;
};

// Helper to create a unique key for each cell based on row data and column
// This uses a combination of row data hash and column name
const getCellKey = (rowData: Record<string, unknown>, columnName: string): string => {
	// Create a stable key from the row data
	// You can customize this based on your primary key structure
	const rowId = rowData.id ?? JSON.stringify(rowData);
	return `${rowId}-${columnName}`;
};

export const useUpdateCellStore = create<UpdateCellStore>()((set, get) => ({
	updates: new Map(),

	setUpdate: (rowData, columnName, newValue, originalValue) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			const key = getCellKey(rowData, columnName);

			// If the new value equals the original value, remove the update
			if (newValue === originalValue) {
				newUpdates.delete(key);
			} else {
				newUpdates.set(key, {
					rowData,
					columnName,
					newValue,
					originalValue,
				});
			}
			console.log("setUpdate", {
				rowData,
				columnName,
				newValue,
				originalValue,
			});
			return { updates: newUpdates };
		});
	},

	clearUpdates: () => set({ updates: new Map() }),

	clearUpdate: (rowData, columnName) => {
		set((state) => {
			const newUpdates = new Map(state.updates);
			newUpdates.delete(getCellKey(rowData, columnName));
			return { updates: newUpdates };
		});
	},

	getUpdates: () => Array.from(get().updates.values()),

	getUpdate: (rowData, columnName) => {
		return get().updates.get(getCellKey(rowData, columnName)) ?? null;
	},

	hasUpdate: (rowData, columnName) => {
		return get().updates.has(getCellKey(rowData, columnName));
	},

	hasAnyUpdates: () => get().updates.size > 0,

	getUpdateCount: () => get().updates.size,
}));
