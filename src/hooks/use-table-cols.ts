import { useQuery } from "@tanstack/react-query";

import { getTableCols } from "@/services/get-table-cols.service";
import { CACHE_KEYS } from "@/utils/constants/constans";

export const useTableCols = (tableName: string | null) => {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [CACHE_KEYS.TABLE_COLS, tableName],
		queryFn: () => getTableCols(tableName),
		staleTime: 0, // 5 minutes
		enabled: !!tableName,
		gcTime: 1000 * 60 * 1, // 10 minutes
		refetchOnMount: true, // refetch on mount
		refetchOnWindowFocus: false, // refetch on window focus
		refetchOnReconnect: true, // refetch on reconnect
	});

	return {
		tableCols: data,
		isLoadingTableCols: isLoading,
		errorTableCols: error,
		refetchTableCols: refetch,
	};
};
