import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { create } from "zustand";

type SchemaEditState = {
	editingColumn: ColumnInfoSchemaType | null;
	setEditingColumn: (column: ColumnInfoSchemaType | null) => void;
	editingTable: string | null;
	setEditingTable: (tableName: string | null) => void;
};

export const useSchemaEditStore = create<SchemaEditState>()((set) => ({
	editingColumn: null,
	setEditingColumn: (column) => set({ editingColumn: column }),
	editingTable: null,
	setEditingTable: (tableName) => set({ editingTable: tableName }),
}));
