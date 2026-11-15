import { useQuery } from "@tanstack/react-query";
import { getDatabaseConnectionInfo } from "@/shared/api";
import { databaseKeys } from "@/shared/query/keys";

export const useDatabaseConnectionInfo = () => {
	const {
		data: connectionInfo,
		isLoading: isLoadingConnectionInfo,
		error: connectionInfoError,
	} = useQuery({
		queryKey: databaseKeys.connectionInfo(),
		queryFn: getDatabaseConnectionInfo,
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5,
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
