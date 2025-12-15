import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import type { ColumnInfo } from "server/src/dao/table-columns.dao";
import { API_URL, CONSTANTS } from "@/utils/constants";

export const useTableCols = () => {
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);

	const {
		data: tableCols,
		isLoading: isLoadingTableCols,
		error: errorTableCols,
	} = useQuery<ColumnInfo[], Error>({
		queryKey: [CONSTANTS.TABLE_COLUMNS, activeTable],
		queryFn: async () => {
			try {
				const response = await fetch(`${API_URL}/tables/${activeTable}/columns`);
				if (!response.ok) {
					throw new Error("Failed to fetch table columns");
				}
				return response.json();
			} catch (error) {
				console.error("Error fetching table columns:", error);
				throw error;
			}
		},
		enabled: !!activeTable,
	});

	return { tableCols, isLoadingTableCols, errorTableCols };
};
