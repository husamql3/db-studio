import { useQuery } from "@tanstack/react-query";
import { parseAsJson, useQueryState } from "nuqs";
import type {
	FilterType,
	SortType,
	TableDataResultSchemaType,
} from "shared/types";
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

	const {
		data: tableData,
		isLoading: isLoadingTableData,
		isRefetching: isRefetchingTableData,
		refetch: refetchTableData,
		error: errorTableData,
	} = useQuery<TableDataResultSchemaType, Error>({
		queryKey: [
			CONSTANTS.CACHE_KEYS.TABLE_DATA,
			activeTableName,
			cursor,
			limit,
			direction,
			isReferencedTable ? JSON.stringify(referencedSort) : regularSort,
			order,
			JSON.stringify(filters),
			selectedDatabase,
		],
		queryFn: () => {
			const defaultLimit = CONSTANTS.CACHE_KEYS.TABLE_DEFAULT_LIMIT.toString();

			// Build params object for cursor-based pagination
			const params: Record<string, string | undefined> = {
				limit: limit?.toString() || defaultLimit,
				database: selectedDatabase ?? undefined,
			};

			// Add cursor if present
			if (cursor) {
				params.cursor = cursor;
			}

			// Add direction if present (defaults to "forward" on server)
			if (direction) {
				params.direction = direction;
			}

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

			return fetcher.get<TableDataResultSchemaType>(
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
