import { create } from "zustand";

interface DatabaseStore {
	selectedDatabase: string | null;
	setSelectedDatabase: (database: string | null) => void;
	dbType: "pg" | "mongodb" | null;
	setDbType: (dbType: "pg" | "mongodb" | null) => void;
}

export const useDatabaseStore = create<DatabaseStore>()((set) => ({
	selectedDatabase: null,
	setSelectedDatabase: (database) => set({ selectedDatabase: database }),
	dbType: null,
	setDbType: (dbType) => set({ dbType }),
}));
