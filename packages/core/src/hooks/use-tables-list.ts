import { useQuery } from "@tanstack/react-query";
import type { TableInfo } from "shared/types";
import { fetcher } from "@/lib/fetcher";
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
		queryFn: () => {
			return fetcher.get<TableInfo[]>("/tables", {
				database: selectedDatabase,
			});
		},
		enabled: !!selectedDatabase,
	});

	return { tablesList, isLoadingTablesList, errorTablesList };
};
