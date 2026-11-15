import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import { create } from "zustand";
import { posthogAnalytics } from "@/lib/posthog";
import { setDbType as setApiDbType } from "@/shared/api/client";
import { onConnectionReset } from "@/stores/connection-reset";

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

		if (database && dbType) posthogAnalytics.capture("db_selected", { db_type: dbType });
	},
	dbType: null,
	// The API client's database routes follow the store, so nothing else sets them.
	setDbType: (dbType) => {
		if (dbType === get().dbType) return;
		set({ dbType });

		if (dbType) {
			setApiDbType(dbType);
			posthogAnalytics.capture("db_connected", { db_type: dbType });
		}
	},
}));

onConnectionReset(() => useDatabaseStore.setState(useDatabaseStore.getInitialState(), true));
