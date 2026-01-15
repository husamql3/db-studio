import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { DEFAULTS } from "shared/constants";
import { useDatabaseStore } from "@/stores/database.store";
import type {
	CurrentDatabase,
	DatabaseConnectionInfo,
	DatabaseInfo,
} from "@/types/database.type";
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
		queryFn: async (): Promise<DatabaseInfo[]> => {
			const response = await fetch(`${DEFAULTS.BASE_URL}/databases`);

			const data = await response.json();
			if (!response.ok) {
				throw new Error("Failed to fetch databases list");
			}
			console.log("useDatabasesList data", data);
			return data;
		},
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
		queryFn: async (): Promise<CurrentDatabase> => {
			const response = await fetch(`${DEFAULTS.BASE_URL}/databases/current`);
			if (!response.ok) {
				throw new Error("Failed to fetch current database");
			}
			return response.json();
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	useEffect(() => {
		if (currentDatabase) {
			console.log("useCurrentDatabase data", currentDatabase);
			if (currentDatabase.database && !selectedDatabase && !isLoadingCurrentDatabase) {
				setSelectedDatabase(currentDatabase.database);
			}
		}
	}, [currentDatabase, selectedDatabase, isLoadingCurrentDatabase, setSelectedDatabase]);

	return { currentDatabase, isLoadingCurrentDatabase, currentDatabaseError };
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
		queryFn: async (): Promise<DatabaseConnectionInfo> => {
			const response = await fetch(`${DEFAULTS.BASE_URL}/databases/connection`);
			if (!response.ok) {
				throw new Error("Failed to fetch database connection info");
			}
			return response.json();
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
