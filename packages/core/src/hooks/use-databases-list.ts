import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type {
	CurrentDatabase,
	DatabaseConnectionInfo,
	DatabaseInfo,
} from "shared/types";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

/**
 * Fetch all databases from the server
 */
export const useDatabasesList = () => {
	const {
		data: databases,
		isLoading: isLoadingDatabases,
		error: databasesError,
		refetch: refetchDatabases,
		isRefetching: isRefetchingDatabases,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.DATABASES_LIST],
		queryFn: () => fetcher.get<DatabaseInfo[]>("/databases"),
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return {
		databases,
		isLoadingDatabases,
		databasesError,
		refetchDatabases,
		isRefetchingDatabases,
	};
};

/**
 * Fetch current database name
 */
export const useCurrentDatabase = () => {
	const { selectedDatabase, setSelectedDatabase } = useDatabaseStore();

	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
	} = useQuery<CurrentDatabase, Error>({
		queryKey: [CONSTANTS.CACHE_KEYS.CURRENT_DATABASE],
		queryFn: () => fetcher.get<CurrentDatabase>("/databases/current"),
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	useEffect(() => {
		if (currentDatabase) {
			if (
				currentDatabase.database &&
				!selectedDatabase &&
				!isLoadingCurrentDatabase
			) {
				setSelectedDatabase(currentDatabase.database);
			}
		}
	}, [
		currentDatabase,
		selectedDatabase,
		isLoadingCurrentDatabase,
		setSelectedDatabase,
	]);

	return {
		currentDatabase,
		isLoadingCurrentDatabase,
		currentDatabaseError,
	};
};

/**
 * Fetch database connection information
 */
export const useDatabaseConnectionInfo = () => {
	const {
		data: connectionInfo,
		isLoading: isLoadingConnectionInfo,
		error: connectionInfoError,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.DATABASE_CONNECTION_INFO],
		queryFn: () => fetcher.get<DatabaseConnectionInfo>("/databases/connection"),
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
