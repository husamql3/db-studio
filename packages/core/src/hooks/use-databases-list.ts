import { useQuery } from "@tanstack/react-query";
import type {
	CurrentDatabase,
	DatabaseConnectionInfo,
	DatabaseInfo,
} from "@/types/database.type";
import { API_URL, CONSTANTS } from "@/utils/constants";

/**
 * Fetch all databases from the server
 */
export const useDatabasesList = () => {
	const {
		data: databases,
		isLoading: isLoadingDatabases,
		error: databasesError,
		refetch: refetchDatabases,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.DATABASES_LIST],
		queryFn: async (): Promise<DatabaseInfo[]> => {
			const response = await fetch(`${API_URL}/databases`);

			const data = await response.json();
			if (!response.ok) {
				throw new Error("Failed to fetch databases list");
			}
			console.log("useDatabasesList data", data);
			return data;
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { databases, isLoadingDatabases, databasesError, refetchDatabases };
};

/**
 * Fetch current database name
 */
export const useCurrentDatabase = () => {
	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.CURRENT_DATABASE],
		queryFn: async (): Promise<CurrentDatabase> => {
			const response = await fetch(`${API_URL}/databases/current`);
			if (!response.ok) {
				throw new Error("Failed to fetch current database");
			}
			return response.json();
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

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
			const response = await fetch(`${API_URL}/databases/connection`);
			if (!response.ok) {
				throw new Error("Failed to fetch database connection info");
			}
			return response.json();
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
