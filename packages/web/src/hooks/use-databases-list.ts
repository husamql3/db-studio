import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
	getCurrentDatabase,
	getDatabaseConnectionInfo,
	getDatabases,
	setDbType as setApiDbType,
} from "@/shared/api";
import { databaseKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

/**
 * Fetch all databases from the server
 */
export const useDatabasesList = () => {
	const { setDbType, selectedDatabase, setSelectedDatabase } = useDatabaseStore();
	const {
		data,
		isLoading: isLoadingDatabases,
		error: databasesError,
		refetch: refetchDatabases,
		isRefetching: isRefetchingDatabases,
	} = useQuery({
		queryKey: databaseKeys.list(),
		queryFn: getDatabases,
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	useEffect(() => {
		if (data?.dbType) {
			setDbType(data.dbType);
			setApiDbType(data.dbType);
		}
		if (!selectedDatabase && data?.databases?.length) {
			setSelectedDatabase(data.databases[0]?.name ?? null);
		}
	}, [data?.dbType, data?.databases, selectedDatabase, setDbType, setSelectedDatabase]);

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
	const { selectedDatabase, setSelectedDatabase, setDbType } = useDatabaseStore();
	const hasInitializedRef = useRef(false);

	// First, fetch the databases list
	const {
		data: databasesData,
		isLoading: isLoadingDatabases,
		error: databasesError,
	} = useQuery({
		queryKey: databaseKeys.list(),
		queryFn: getDatabases,
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5,
	});

	// Then fetch current database (only after databases list is loaded)
	const {
		data: currentDatabase,
		isLoading: isLoadingCurrentDatabase,
		error: currentDatabaseError,
	} = useQuery({
		queryKey: databaseKeys.current(),
		queryFn: async () => {
			const res = await getCurrentDatabase();

			// init the api baseURL with the dbType from the first request
			setDbType(res.data.data.dbType);
			setApiDbType(res.data.data.dbType);
			if (!selectedDatabase && res.data.data.db) {
				setSelectedDatabase(res.data.data.db);
			}
			return res.data.data;
		},
		staleTime: 1000 * 60 * 5,
		enabled: !!databasesData, // Only run after databases are loaded
	});

	// Initialize once requests settle so UI does not get stuck on the loading screen.
	// Run in an effect to avoid state updates during render.
	useEffect(() => {
		if (hasInitializedRef.current) return;
		if (isLoadingDatabases || isLoadingCurrentDatabase) return;

		hasInitializedRef.current = true;
		const dbToSelect = currentDatabase?.db || databasesData?.databases?.[0]?.name;
		if (dbToSelect) {
			setSelectedDatabase(dbToSelect);
		}
	}, [
		isLoadingDatabases,
		isLoadingCurrentDatabase,
		currentDatabase?.db,
		databasesData?.databases,
		setSelectedDatabase,
	]);

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
		queryKey: databaseKeys.connectionInfo(),
		queryFn: getDatabaseConnectionInfo,
		select: (response) => response.data.data,
		staleTime: 1000 * 60 * 5, // 5 minutes
	});

	return { connectionInfo, isLoadingConnectionInfo, connectionInfoError };
};
