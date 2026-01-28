import { useQuery } from "@tanstack/react-query";
import type { BaseResponse, ColumnInfoSchemaType } from "shared/types";
import { api } from "@/lib/api";
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
	} = useQuery({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName, selectedDatabase],
		queryFn: () => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			return api.get<BaseResponse<ColumnInfoSchemaType[]>>(`/tables/${tableName}/columns`, {
				params,
			});
		},
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
