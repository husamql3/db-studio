import { useQuery } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { ColumnInfo } from "shared/types";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTableCols = ({ tableName }: { tableName: string }) => {
	const { selectedDatabase } = useDatabaseStore();

	// let activeTable: string;
	// const [activeTableQuery] = useQueryState(CONSTANTS.ACTIVE_TABLE);

	// if (tableName) {
	// 	activeTable = tableName;
	// } else {
	// 	activeTable = activeTableQuery ?? "";
	// }

	const {
		data: tableCols,
		isLoading: isLoadingTableCols,
		isRefetching: isRefetchingTableCols,
		error: errorTableCols,
		refetch: refetchTableCols,
	} = useQuery<ColumnInfo[], Error>({
		queryKey: [CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName, selectedDatabase],
		queryFn: async () => {
			try {
				const url = new URL(`${DEFAULTS.BASE_URL}/tables/${tableName}/columns`);
				if (selectedDatabase) {
					url.searchParams.set("database", selectedDatabase);
				}
				const response = await fetch(url.toString());
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
		enabled: !!tableName,
	});

	return {
		tableCols,
		isLoadingTableCols,
		isRefetchingTableCols,
		errorTableCols,
		refetchTableCols,
	};
};
