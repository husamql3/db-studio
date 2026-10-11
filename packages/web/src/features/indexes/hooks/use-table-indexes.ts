import { useQuery } from "@tanstack/react-query";
import { getTableIndexes } from "@/shared/api";
import { indexKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useTableIndexes = ({ tableName }: { tableName: string }) => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tableIndexes,
		isLoading: isLoadingTableIndexes,
		isRefetching: isRefetchingTableIndexes,
		error: errorTableIndexes,
		refetch: refetchTableIndexes,
	} = useQuery({
		queryKey: indexKeys.table(tableName, selectedDatabase),
		queryFn: () => getTableIndexes(tableName, selectedDatabase),
		select: (res) => res.data.data,
		enabled: !!tableName && !!selectedDatabase,
	});

	return {
		tableIndexes,
		isLoadingTableIndexes,
		isRefetchingTableIndexes,
		errorTableIndexes,
		refetchTableIndexes,
	};
};
