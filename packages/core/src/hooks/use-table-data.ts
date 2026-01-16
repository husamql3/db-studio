import { useQuery } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import { DEFAULTS } from "shared/constants";
import type { Filter, Sort, TableDataResult } from "shared/types";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTableData = ({
	tableName,
	isReferencedTable = false,
}: {
	tableName: string;
	isReferencedTable?: boolean;
}) => {
	const { selectedDatabase } = useDatabaseStore();
	const [activeTable] = useQueryState(CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE);
	const activeTableName = tableName || activeTable;

	const [page] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.PAGE
			: CONSTANTS.TABLE_STATE_KEYS.PAGE,
	);
	const [pageSize] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString() // limit 30 for referenced table
			: CONSTANTS.TABLE_STATE_KEYS.LIMIT, // limit 50 for table
	);

	// For referenced tables, sort is an array of Sort objects
	const [referencedSort] = useQueryState<Sort[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT,
		parseAsJson((value) => value as Sort[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	// For regular tables, sort is a string (column name)
	const [regularSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

	const [filters] = useQueryState<Filter[]>(
		// CONSTANTS.TABLE_STATE_KEYS.FILTERS,
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS
			: CONSTANTS.TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as Filter[])
			.withDefault([])
			.withOptions({ history: "push" }),
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
			activeTableName,
			page,
			pageSize,
			isReferencedTable ? JSON.stringify(referencedSort) : regularSort,
			order,
			JSON.stringify(filters),
			selectedDatabase,
		],
		queryFn: async () => {
			const defaultPage = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_PAGE.toString();
			const defaultLimit = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString();

			const queryParams = new URLSearchParams();

			queryParams.set("page", page?.toString() || defaultPage);
			queryParams.set("pageSize", pageSize?.toString() || defaultLimit);

			// Handle sort parameter based on table type
			if (isReferencedTable) {
				if (referencedSort && referencedSort.length > 0) {
					queryParams.set("sort", JSON.stringify(referencedSort));
				}
			} else {
				if (regularSort) queryParams.set("sort", regularSort);
				if (order) queryParams.set("order", order);
			}

			if (filters && filters.length > 0) {
				queryParams.set("filters", JSON.stringify(filters));
			}

			if (selectedDatabase) {
				queryParams.set("database", selectedDatabase);
			}

			try {
				const response = await fetch(
					`${DEFAULTS.BASE_URL}/tables/${activeTableName}/data?${queryParams.toString()}`,
				);
				console.log("queryParams", queryParams.toString());
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
		enabled: !!activeTableName,
	});

	return {
		tableData,
		isLoadingTableData,
		isRefetchingTableData,
		errorTableData,
		refetchTableData,
	};
};
