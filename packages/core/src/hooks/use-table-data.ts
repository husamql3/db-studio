import { useQuery } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import type { Filter, Sort, TableDataResult } from "shared/types";
import { fetcher } from "@/lib/fetcher";
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
	const [activeTable] = useQueryState(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.ACTIVE_TABLE,
	);
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
		queryFn: () => {
			const defaultPage = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_PAGE.toString();
			const defaultLimit = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString();

			// Build params object
			const params: Record<string, string | undefined> = {
				page: page?.toString() || defaultPage,
				pageSize: pageSize?.toString() || defaultLimit,
				database: selectedDatabase ?? undefined,
			};

			// Handle sort parameter based on table type
			if (isReferencedTable) {
				if (referencedSort && referencedSort.length > 0) {
					params.sort = JSON.stringify(referencedSort);
				}
			} else {
				if (regularSort) params.sort = regularSort;
				if (order) params.order = order;
			}

			if (filters && filters.length > 0) {
				params.filters = JSON.stringify(filters);
			}

			return fetcher.get<TableDataResult>(
				`/tables/${activeTableName}/data`,
				params,
			);
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
