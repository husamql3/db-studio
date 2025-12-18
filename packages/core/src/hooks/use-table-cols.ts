import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import type { ColumnInfo } from "server/src/dao/table-columns.dao";
import { API_URL, CONSTANTS } from "@/utils/constants";

export const useTableCols = (tableName?: string) => {
	let activeTable: string;
	const [activeTableQuery] = useQueryState(CONSTANTS.ACTIVE_TABLE);

	if (tableName) {
		activeTable = tableName;
	} else {
		activeTable = activeTableQuery ?? "";
	}

	const {
		data: tableCols,
		isLoading: isLoadingTableCols,
		isRefetching: isRefetchingTableCols,
		error: errorTableCols,
		refetch: refetchTableCols,
	} = useQuery<ColumnInfo[], Error>({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, activeTable],
		queryFn: async () => {
			try {
				const response = await fetch(`${API_URL}/tables/${activeTable}/columns`);
				if (!response.ok) {
					throw new Error("Failed to fetch table columns");
				}

				const data = await response.json();
				console.log("useTableCols", data);
				return data;
			} catch (error) {
				console.error("Error fetching table columns:", error);
				throw error;
			}
		},
		enabled: !!activeTable,
	});

	return {
		tableCols,
		isLoadingTableCols,
		isRefetchingTableCols,
		errorTableCols,
		refetchTableCols,
	};
};
