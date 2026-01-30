import { create } from "zustand";

type InsertSqlState = {
	pendingSql: string | null;
	setPendingSql: (sql: string | null) => void;
};

export const useInsertSqlStore = create<InsertSqlState>()((set) => ({
	pendingSql: null,
	setPendingSql: (sql) => set({ pendingSql: sql }),
}));
