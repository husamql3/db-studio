import { useQuery } from "@tanstack/react-query";
import { getServerLogs } from "@/shared/api";
import { serverLogKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

/** Reads the server log; while live, polls for new entries every few seconds. */
export const useServerLogs = ({ live }: { live: boolean }) => {
	const { selectedDatabase } = useDatabaseStore();

	const { data, isLoading, isRefetching, error, refetch } = useQuery({
		queryKey: serverLogKeys.database(selectedDatabase),
		queryFn: () => getServerLogs(selectedDatabase),
		select: (res) => res.data.data,
		enabled: !!selectedDatabase,
		refetchInterval: live ? 3000 : false,
	});

	return {
		serverLogs: data,
		isLoadingServerLogs: isLoading,
		isRefetchingServerLogs: isRefetching,
		errorServerLogs: error,
		refetchServerLogs: refetch,
	};
};
