import { useQuery } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import type { TableDataResult } from "server/src/dao/tables-data.dao";
import { API_URL, CONSTANTS } from "@/utils/constants";

export type Filter = {
	columnName: string;
	operator: string;
	value: unknown;
};

export const useTableData = (isReferencedTable: boolean = false) => {
	const [activeTable] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE
			: CONSTANTS.ACTIVE_TABLE,
	);
	const [page] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.PAGE
			: CONSTANTS.TABLE_STATE_KEYS.PAGE,
	);
	const [pageSize] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT
			: CONSTANTS.TABLE_STATE_KEYS.LIMIT,
	);
	const [sort] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT
			: CONSTANTS.TABLE_STATE_KEYS.SORT,
	);
	const [order] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ORDER
			: CONSTANTS.TABLE_STATE_KEYS.ORDER,
	);
	const [filters] = useQueryState<Filter[]>(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS
			: CONSTANTS.TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as Filter[]).withDefault([]),
	);

	const {
		data: tableData,
		isLoading: isLoadingTableData,
		isRefetching: isRefetchingTableData,
		refetch: refetchTableData,
		error: errorTableData,
	} = useQuery<TableDataResult, Error>({
		queryKey: [
			CONSTANTS.CACHE_KEYS.TABLE_DATA,
			activeTable,
			page,
			pageSize,
			sort,
			order,
			JSON.stringify(filters),
		],
		queryFn: async () => {
			const defaultPage = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_PAGE.toString();
			const defaultLimit = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString();

			const queryParams = new URLSearchParams();

			queryParams.set("page", page?.toString() || defaultPage);
			queryParams.set("pageSize", pageSize?.toString() || defaultLimit);
			if (sort) queryParams.set("sort", sort);
			if (order) queryParams.set("order", order);
			if (filters && filters.length > 0) {
				queryParams.set("filters", JSON.stringify(filters));
			}

			try {
				const response = await fetch(
					`${API_URL}/tables/${activeTable}/data?${queryParams.toString()}`,
				);
				if (!response.ok) {
					throw new Error("Failed to fetch table data");
				}

				const data = await response.json();
				console.log("useTableData", data);
				return data;
			} catch (error) {
				console.error("Error fetching table data:", error);
				throw error;
			}
		},
		enabled: !!activeTable,
	});

	return {
		tableData,
		isLoadingTableData,
		isRefetchingTableData,
		errorTableData,
		refetchTableData,
	};
};
