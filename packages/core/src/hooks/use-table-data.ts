import { useQuery } from "@tanstack/react-query";
import { getTableData } from "@/services/get-table-data.service";
import { useActiveTableStore } from "@/stores/active-table.store";
import { CACHE_KEYS } from "@/utils/constants/constans";

export const useTableData = (tableName: string | null) => {
	const { page, pageSize, sortColumn, sortOrder, filters } = useActiveTableStore();

	const {
		data,
		isLoading,
		error,
		refetch,
		isPending: isRefetching,
	} = useQuery({
		queryKey: [
			CACHE_KEYS.TABLE_DATA,
			tableName,
			page,
			pageSize,
			sortColumn,
			sortOrder,
			filters,
		],
		queryFn: () =>
			getTableData(tableName, page, pageSize, sortColumn ?? "", sortOrder, filters),
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
		isRefetchingTableData: isRefetching,
	};
};
