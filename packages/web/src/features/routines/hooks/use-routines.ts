import { useQuery } from "@tanstack/react-query";
import { getRoutines } from "@/shared/api";
import { routineKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useRoutines = () => {
	const { selectedDatabase } = useDatabaseStore();
	const { data, isLoading, isRefetching, error, refetch } = useQuery({
		queryKey: routineKeys.database(selectedDatabase),
		queryFn: () => getRoutines(selectedDatabase),
		select: (response) => response.data.data,
		enabled: !!selectedDatabase,
	});

	return {
		routines: data,
		isLoadingRoutines: isLoading,
		isRefetchingRoutines: isRefetching,
		errorRoutines: error,
		refetchRoutines: refetch,
	};
};
