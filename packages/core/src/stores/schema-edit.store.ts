import type { ColumnInfoSchemaType } from "shared/types";
import { create } from "zustand";

type SchemaEditState = {
	editingColumn: ColumnInfoSchemaType | null;
	setEditingColumn: (column: ColumnInfoSchemaType | null) => void;
};

export const useSchemaEditStore = create<SchemaEditState>()((set) => ({
	editingColumn: null,
	setEditingColumn: (column) => set({ editingColumn: column }),
}));
