import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import type { TableDataResult } from "server/src/dao/tables-data.dao";
import { API_URL, CONSTANTS } from "@/utils/constants";

export const useTableData = () => {
	const [activeTable] = useQueryState(CONSTANTS.ACTIVE_TABLE);
	const [page] = useQueryState(CONSTANTS.PAGE);
	const [pageSize] = useQueryState(CONSTANTS.LIMIT);
	const [sort] = useQueryState(CONSTANTS.SORT);
	const [order] = useQueryState(CONSTANTS.ORDER);
	const [filters] = useQueryState(CONSTANTS.FILTERS);

	const {
		data: tableData,
		isLoading: isLoadingTableData,
		refetch: refetchTableData,
		error: errorTableData,
	} = useQuery<TableDataResult, Error>({
		queryKey: [
			CONSTANTS.TABLE_DATA,
			activeTable,
			page,
			pageSize,
			sort,
			order,
			JSON.stringify(filters),
		],
		queryFn: async () => {
			const queryParams = new URLSearchParams();
			const defaultPage = CONSTANTS.TABLE_DEFAULT_PAGE.toString();
			const defaultLimit = CONSTANTS.TABLE_DEFAULT_LIMIT.toString();

			queryParams.set("page", page?.toString() || defaultPage);
			queryParams.set("pageSize", pageSize?.toString() || defaultLimit);
			if (sort) queryParams.set("sort", sort);
			if (order) queryParams.set("order", order);
			if (filters && filters.length > 0)
				queryParams.set("filters", JSON.stringify(filters));

			try {
				const response = await fetch(
					`${API_URL}/tables/${activeTable}/data?${queryParams.toString()}`,
				);
				if (!response.ok) {
					throw new Error("Failed to fetch table data");
				}
				return response.json();
			} catch (error) {
				console.error("Error fetching table data:", error);
				throw error;
			}
		},
		enabled: !!activeTable,
	});

	return { tableData, isLoadingTableData, errorTableData, refetchTableData };
};
