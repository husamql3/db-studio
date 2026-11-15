import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getCurrentDatabase, getDatabases } from "@/shared/api";
import { databaseKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

const databasesListQuery = queryOptions({
	queryKey: databaseKeys.list(),
	queryFn: getDatabases,
	select: (response) => response.data.data,
	staleTime: 1000 * 60 * 5,
});

export const useDatabasesList = () => {
	const {
		data,
		isLoading: isLoadingDatabases,
		error: databasesError,
		refetch: refetchDatabases,
		isRefetching: isRefetchingDatabases,
	} = useQuery(databasesListQuery);

	return {
		databases: data?.databases,
		dbType: data?.dbType,
		isLoadingDatabases,
		databasesError,
		refetchDatabases,
		isRefetchingDatabases,
	};
};

/**
 * Sets the store's engine and selected database from the server: the current database, else the
 * first listed. Initialized once both are in the store, so the app's requests go to the engine's
 * routes from the start.
 */
export const useInitializeDatabase = () => {
	const { dbType, selectedDatabase, setSelectedDatabase, setDbType } = useDatabaseStore();

	const {
		data: databasesData,
		isLoading: isLoadingDatabases,
		error: databasesError,
	} = useQuery(databasesListQuery);

	// The current database comes from its own endpoint, so it loads alongside the list.
	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
	} = useQuery({
		queryKey: databaseKeys.current(),
		queryFn: async () => (await getCurrentDatabase()).data.data,
		staleTime: 1000 * 60 * 5,
	});

	const isLoading = isLoadingDatabases || isLoadingCurrentDatabase;
	const serverDbType = currentDatabase?.dbType ?? databasesData?.dbType;
	const databaseToSelect = currentDatabase?.db || databasesData?.databases?.[0]?.name;

	useEffect(() => {
		if (serverDbType) setDbType(serverDbType);
	}, [serverDbType, setDbType]);

	useEffect(() => {
		if (!isLoading && !selectedDatabase && databaseToSelect) {
			setSelectedDatabase(databaseToSelect);
		}
	}, [isLoading, selectedDatabase, databaseToSelect, setSelectedDatabase]);

	return {
		currentDatabase,
		databases: databasesData?.databases,
		isLoading,
		isInitialized:
			!isLoading && dbType !== null && (selectedDatabase !== null || !databaseToSelect),
		error: databasesError || currentDatabaseError,
	};
};
