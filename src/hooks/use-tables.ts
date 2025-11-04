import { useQuery } from "@tanstack/react-query";

import { getTables } from "@/services/api.service";
import { CONSTANTS } from "@/utils/constants";

export const useTables = () => {
	const { data, isLoading, refetch } = useQuery({
		queryKey: [CONSTANTS.TABLES],
		queryFn: getTables,
		staleTime: 1000 * 60 * 5, // 15 minutes
		gcTime: 1000 * 60 * 10, // 10 minutes
		refetchOnMount: true, // refetch on mount
		refetchOnWindowFocus: false, // refetch on window focus
		refetchOnReconnect: true, // refetch on reconnect
	});

	return { tables: data, isLoadingTables: isLoading, refetchTables: refetch };
};
