import { useQuery } from "@tanstack/react-query";
import type { ColumnInfo } from "shared/types";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTableCols = ({ tableName }: { tableName: string }) => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		data: tableCols,
		isLoading: isLoadingTableCols,
		isRefetching: isRefetchingTableCols,
		error: errorTableCols,
		refetch: refetchTableCols,
	} = useQuery<ColumnInfo[], Error>({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName, selectedDatabase],
		queryFn: () =>
			fetcher.get<ColumnInfo[]>(`/tables/${tableName}/columns`, {
				database: selectedDatabase,
			}),
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
