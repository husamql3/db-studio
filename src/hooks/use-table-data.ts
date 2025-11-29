import { useQuery } from "@tanstack/react-query";

import { getTableData } from "@/services/get-table-data.service";
import { CACHE_KEYS } from "@/utils/constants/constans";
import { useSearchParamsUtils } from "@/utils/search-params";

export const useTableData = (tableName: string | null) => {
	const { getParamAsNumber } = useSearchParamsUtils();
	const page = getParamAsNumber("page") ?? 1;
	const pageSize = getParamAsNumber("pageSize") ?? 50;

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [CACHE_KEYS.TABLE_DATA, tableName, page, pageSize],
		queryFn: () => getTableData(tableName, page, pageSize),
		enabled: !!tableName,
		staleTime: 0, // no stale time
		gcTime: 1000 * 60 * 1, // 1 minute
		refetchOnMount: true, // refetch on mount
		refetchOnWindowFocus: false, // refetch on window focus
		refetchOnReconnect: true, // refetch on reconnect
	});

	return {
		tableData: data,
		isLoadingTableData: isLoading,
		errorTableData: error,
		refetchTableData: refetch,
	};
};
