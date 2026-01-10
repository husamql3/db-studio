import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DatabaseStore {
	selectedDatabase: string | null;
	setSelectedDatabase: (database: string | null) => void;
}

export const useDatabaseStore = create<DatabaseStore>()(
	persist(
		(set) => ({
			selectedDatabase: null,
			setSelectedDatabase: (database) => set({ selectedDatabase: database }),
		}),
		{
			name: "database-storage",
		},
	),
);
