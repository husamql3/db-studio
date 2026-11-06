import type { FilterType } from "@db-studio/shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTableData } from "@/shared/api";
import { tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const DEFAULT_PAGE_LIMIT = "50";

export type TablePageParams = {
	tableName: string;
	schemaName: string | undefined;
	cursor: string | null;
	direction: string | null;
	limit: string | null;
	/** A column name, or a JSON array of `SortType` when `order` is null. */
	sort: string | null;
	order: string | null;
	filters: FilterType[];
};

export const useTableData = (params: TablePageParams) => {
	const { selectedDatabase } = useDatabaseStore();

	const page = {
		...params,
		filters: params.filters.length > 0 ? JSON.stringify(params.filters) : undefined,
		db: selectedDatabase,
	};

	const fetchPage = (target: typeof page) =>
		getTableData({
			tableName: target.tableName,
			schemaName: target.schemaName,
			limit: target.limit || DEFAULT_PAGE_LIMIT,
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
		enabled: !!page.tableName,
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
