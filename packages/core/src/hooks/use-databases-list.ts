import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
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
 * Fetch current database name
 */
export const useCurrentDatabase = () => {
	const { selectedDatabase, setSelectedDatabase } = useDatabaseStore();

	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.CURRENT_DATABASE],
		queryFn: async () => {
			const res =
				await rootApi.get<BaseResponse<CurrentDatabaseSchemaType>>("/databases/current");

			// init the api baseURL with the dbType from the first request
			setDbType(res.data.data.dbType);
			return res.data.data;
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	useEffect(() => {
		if (currentDatabase) {
			if (currentDatabase.database && !selectedDatabase && !isLoadingCurrentDatabase) {
				setSelectedDatabase(currentDatabase.database);
			}
		}
	}, [currentDatabase, selectedDatabase, isLoadingCurrentDatabase, setSelectedDatabase]);

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
		queryFn: () =>
			rootApi.get<BaseResponse<ConnectionInfoSchemaType>>("/databases/connection"),
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
