import { useQuery } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import type { FilterType, SortType } from "shared/types";
import { getTableData } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
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
	const activeTableName = tableName || activeTable || "";

	// Cursor-based pagination state
	const [cursor] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.CURSOR
			: CONSTANTS.TABLE_STATE_KEYS.CURSOR,
	);
	const [limit] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.LIMIT.toString()
			: CONSTANTS.TABLE_STATE_KEYS.LIMIT,
	);
	const [direction] = useQueryState(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.DIRECTION
			: CONSTANTS.TABLE_STATE_KEYS.DIRECTION,
	);

	// For referenced tables, sort is an array of Sort objects
	const [referencedSort] = useQueryState<SortType[]>(
		CONSTANTS.REFERENCED_TABLE_STATE_KEYS.SORT,
		parseAsJson((value) => value as SortType[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	// For regular tables, sort is a string (column name)
	const [regularSort] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.SORT);
	const [order] = useQueryState(CONSTANTS.TABLE_STATE_KEYS.ORDER);

	const [filters] = useQueryState<FilterType[]>(
		isReferencedTable
			? CONSTANTS.REFERENCED_TABLE_STATE_KEYS.FILTERS
			: CONSTANTS.TABLE_STATE_KEYS.FILTERS,
		parseAsJson((value) => value as FilterType[])
			.withDefault([])
			.withOptions({ history: "push" }),
	);

	const serializedSort =
		isReferencedTable && referencedSort?.length > 0
			? JSON.stringify(referencedSort)
			: regularSort;
	const serializedFilters = filters?.length > 0 ? JSON.stringify(filters) : undefined;

	const {
		data: tableData,
		isLoading: isLoadingTableData,
		isRefetching: isRefetchingTableData,
		refetch: refetchTableData,
		error: errorTableData,
	} = useQuery({
		queryKey: tableKeys.data({
			tableName: activeTableName,
			cursor,
			limit,
			direction,
			sort: serializedSort,
			order,
			filters: serializedFilters,
			db: selectedDatabase,
		}),
		queryFn: async () => {
			const defaultLimit = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString();
			return getTableData({
				tableName: activeTableName,
				limit: limit?.toString() || defaultLimit,
				db: selectedDatabase ?? undefined,
				cursor,
				direction,
				sort: serializedSort ?? undefined,
				order,
				filters: serializedFilters,
			});
		},
		select: (res) => res.data.data,
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
