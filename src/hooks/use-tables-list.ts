import { useQuery } from "@tanstack/react-query";
import { getTableList } from "@/services/get-table-list.service";

export const useTablesList = () => {
	const { data: tablesList, isLoading: isLoadingTables } = useQuery({
		queryKey: ["tables-list"],
		queryFn: () => getTableList(),
		staleTime: 1000 * 60 * 5, // 15 minutes
		gcTime: 1000 * 60 * 10, // 10 minutes
		refetchOnMount: true, // refetch on mount
		refetchOnWindowFocus: false, // refetch on window focus
		refetchOnReconnect: true, // refetch on reconnect
	});

	return { tablesList, isLoadingTables };
};
