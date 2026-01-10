import { useQuery } from "@tanstack/react-query";
import type { TableInfo } from "server/src/dao/table-list.dao";
import { useDatabaseStore } from "@/stores/database.store";
import { API_URL, CONSTANTS } from "@/utils/constants";

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
				const url = new URL(`${API_URL}/tables`);
				if (selectedDatabase) {
					url.searchParams.set("database", selectedDatabase);
				}
				const response = await fetch(url.toString());
				console.log("useTablesList response", response);
				if (!response.ok) {
					throw new Error("Failed to fetch tables list");
				}
				return response.json() as Promise<TableInfo[]>;
			} catch (error) {
				console.error("Error fetching tables list:", error);
				throw error;
			}
		},
	});

	return { tablesList, isLoadingTablesList, errorTablesList };
};
