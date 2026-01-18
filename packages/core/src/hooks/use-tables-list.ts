import { useQuery } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { TableInfo } from "shared/types";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTablesList = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tablesList,
		isLoading: isLoadingTablesList,
		error: errorTablesList,
	} = useQuery<TableInfo[], Error>({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLES_LIST, selectedDatabase],
		queryFn: async () => {
			try {
				const url = new URL(`${DEFAULTS.BASE_URL}/tables`);
				selectedDatabase && url.searchParams.set("database", selectedDatabase);

				const response = await fetch(url.toString());
				const data = await response.json();
				if (!response.ok) {
					throw new Error("Failed to fetch tables list");
				}
				console.log("useTablesList data", data);
				return data;
			} catch (error) {
				console.error("Error fetching tables list:", error);
				throw error;
			}
		},
		enabled: !!selectedDatabase,
	});

	return { tablesList, isLoadingTablesList, errorTablesList };
};
