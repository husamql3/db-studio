import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import { create } from "zustand";
import { posthogAnalytics } from "@/lib/posthog";

interface DatabaseStore {
	selectedDatabase: string | null;
	setSelectedDatabase: (database: string | null) => void;
	dbType: DatabaseTypeSchema | null;
	setDbType: (dbType: DatabaseTypeSchema | null) => void;
}

export const useDatabaseStore = create<DatabaseStore>()((set, get) => ({
	selectedDatabase: null,
	setSelectedDatabase: (database) => {
		set({ selectedDatabase: database });
		const { dbType } = get();
		if (database && dbType)
			posthogAnalytics.capture("db_selected", { db_type: dbType, database });
	},
	dbType: null,
	setDbType: (dbType) => {
		set({ dbType });
		if (dbType) posthogAnalytics.capture("db_connected", { db_type: dbType });
	},
}));
