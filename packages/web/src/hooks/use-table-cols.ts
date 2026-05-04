import { useQuery } from "@tanstack/react-query";
import { getTableColumns } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useTableCols = ({ tableName }: { tableName: string }) => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tableCols,
		isLoading: isLoadingTableCols,
		isRefetching: isRefetchingTableCols,
		error: errorTableCols,
		refetch: refetchTableCols,
	} = useQuery({
		queryKey: tableKeys.columns(tableName, selectedDatabase),
		queryFn: () => getTableColumns(tableName, selectedDatabase),
		select: (res) => res.data.data,
		enabled: !!tableName && !!selectedDatabase,
	});

	return {
		tableCols,
		isLoadingTableCols,
		isRefetchingTableCols,
		errorTableCols,
		refetchTableCols,
	};
};
