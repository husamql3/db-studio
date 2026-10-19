import type { FilterType, SortType } from "@db-studio/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import { getTableData } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";
import { CONSTANTS } from "@/utils/constants";

export const useTableData = ({
	tableName,
	schemaName,
	isReferencedTable = false,
}: {
	tableName: string;
	schemaName: string | undefined;
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

	const page = {
		tableName: activeTableName,
		cursor,
		limit,
		direction,
		sort: serializedSort,
		order,
		filters: serializedFilters,
		db: selectedDatabase,
		schemaName,
	};
	const fetchPage = (target: typeof page) =>
		getTableData({
			tableName: target.tableName,
			schemaName: target.schemaName,
			limit: target.limit?.toString() || CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString(),
			db: target.db ?? undefined,
			cursor: target.cursor,
			direction: target.direction,
			sort: target.sort ?? undefined,
			order: target.order,
			filters: target.filters,
		});

	const {
		data: tableData,
		isLoading: isLoadingTableData,
		isRefetching: isRefetchingTableData,
		refetch: refetchTableData,
		error: errorTableData,
	} = useQuery({
		queryKey: tableKeys.data(page),
		queryFn: () => fetchPage(page),
		select: (res) => res.data.data,
		enabled: !!activeTableName,
	});

	const queryClient = useQueryClient();
	/**
	 * Loads a neighbouring page into the cache, e.g. while the pointer is on its button, so the
	 * page shows without waiting on the database once it is clicked.
	 */
	const prefetchPage = (pageCursor: string, pageDirection: "asc" | "desc") => {
		const target = { ...page, cursor: pageCursor, direction: pageDirection };
		void queryClient.prefetchQuery({
			queryKey: tableKeys.data(target),
			queryFn: () => fetchPage(target),
		});
	};

	return {
		tableData,
		prefetchPage,
		/** Changes whenever the grid shows a different page, sort or filter. */
		pageKey: JSON.stringify(tableKeys.data(page)),
		isLoadingTableData,
		isRefetchingTableData,
		errorTableData,
		refetchTableData,
	};
};
