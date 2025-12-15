import { useQuery } from "@tanstack/react-query";
import type { TableInfo } from "server/src/dao/table-list.dao";
import { API_URL, CONSTANTS } from "@/utils/constants";

export const useTablesList = () => {
	const {
		data: tablesList,
		isLoading: isLoadingTablesList,
		error: errorTablesList,
	} = useQuery<TableInfo[], Error>({
		queryKey: [CONSTANTS.TABLES_LIST],
		queryFn: async () => {
			try {
				const response = await fetch(`${API_URL}/tables`);
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
