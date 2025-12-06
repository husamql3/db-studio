import { useQuery } from "@tanstack/react-query";
import { getTableList } from "@/services/get-table-list.service";
import { CACHE_KEYS } from "@/utils/constants/constans";

export const useTablesList = () => {
	const { data: tablesList, isLoading: isLoadingTables } = useQuery({
		queryKey: [CACHE_KEYS.TABLES_LIST],
		queryFn: () => getTableList(),
		staleTime: 1000 * 60 * 5, // 15 minutes
		gcTime: 1000 * 60 * 10, // 10 minutes
		refetchOnMount: true, // refetch on mount
		refetchOnWindowFocus: false, // refetch on window focus
		refetchOnReconnect: true, // refetch on reconnect
	});

	return { tablesList, isLoadingTables };
};
