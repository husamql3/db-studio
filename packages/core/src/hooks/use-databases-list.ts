import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import type {
	BaseResponse,
	ConnectionInfoSchemaType,
	CurrentDatabaseSchemaType,
	DatabaseListSchemaType,
} from "shared/types";
import { rootApi, setDbType } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

/**
 * Fetch all databases from the server
 */
export const useDatabasesList = () => {
	const {
		data,
		isLoading: isLoadingDatabases,
		error: databasesError,
		refetch: refetchDatabases,
		isRefetching: isRefetchingDatabases,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.DATABASES_LIST],
		queryFn: () => rootApi.get<BaseResponse<DatabaseListSchemaType>>("/databases"),
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

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
 * Initialize database connection and selected database.
 * Fetches current database, falls back to first database in list if none.
 * Shows loading until a database is selected.
 */
export const useInitializeDatabase = () => {
	const setSelectedDatabase = useDatabaseStore((state) => state.setSelectedDatabase);
	const hasInitializedRef = useRef(false);

	// First, fetch the databases list
	const {
		data: databasesData,
		isLoading: isLoadingDatabases,
		error: databasesError,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.DATABASES_LIST],
		queryFn: () => rootApi.get<BaseResponse<DatabaseListSchemaType>>("/databases"),
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5,
	});

	// Then fetch current database (only after databases list is loaded)
	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
		isSuccess: isCurrentDbSuccess,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.CURRENT_DATABASE],
		queryFn: async () => {
			const res =
				await rootApi.get<BaseResponse<CurrentDatabaseSchemaType>>("/databases/current");

			// init the api baseURL with the dbType from the first request
			setDbType(res.data.data.dbType);
			return res.data.data;
		},
		staleTime: 1000 * 60 * 5,
		enabled: !!databasesData, // Only run after databases are loaded
	});

	// Initialize selected database once both queries succeed
	if (!hasInitializedRef.current && isCurrentDbSuccess && databasesData) {
		hasInitializedRef.current = true;
		// Use current database if available, otherwise fall back to first database
		const dbToSelect = currentDatabase?.db || databasesData.databases?.[0]?.name;
		if (dbToSelect) {
			setSelectedDatabase(dbToSelect);
		}
	}

	const isLoading = isLoadingDatabases || isLoadingCurrentDatabase;
	const isInitialized = hasInitializedRef.current;

	return {
		currentDatabase,
		databases: databasesData?.databases,
		isLoading,
		isInitialized,
		error: databasesError || currentDatabaseError,
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
		queryFn: () =>
			rootApi.get<BaseResponse<ConnectionInfoSchemaType>>("/databases/connection"),
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
