import type { DatabaseTypeSchema } from "shared/types";
import { create } from "zustand";

interface DatabaseStore {
	selectedDatabase: string | null;
	setSelectedDatabase: (database: string | null) => void;
	dbType: DatabaseTypeSchema | null;
	setDbType: (dbType: DatabaseTypeSchema | null) => void;
}

export const useDatabaseStore = create<DatabaseStore>()((set) => ({
	selectedDatabase: null,
	setSelectedDatabase: (database) => set({ selectedDatabase: database }),
	dbType: null,
	setDbType: (dbType) => set({ dbType }),
}));
