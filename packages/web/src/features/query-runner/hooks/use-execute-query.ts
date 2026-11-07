import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { posthogAnalytics } from "@/lib/posthog";
import { executeQuery as executeQueryRequest } from "@/shared/api";
import { indexKeys, redisKeyBrowserKeys, tableKeys } from "@/shared/query/keys";
import { useDatabaseStore } from "@/stores/database.store";

export const useExecuteQuery = () => {
	const queryClient = useQueryClient();
	const { selectedDatabase, dbType } = useDatabaseStore();

	const {
		// `mutate` reports a failure through `executeQueryError` only, never as a rejection.
		mutate: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const res = await executeQueryRequest({ query, db: selectedDatabase });

			return res.data.data;
		},
		// A query can change any table's rows, columns or indexes, create and drop tables, or
		// write Redis keys.
		// Not awaited: the result shows while the other screens refetch.
		onSuccess: () => {
			for (const queryKey of [
				tableKeys.lists(),
				tableKeys.allColumns(),
				tableKeys.allData(),
				indexKeys.all(),
				redisKeyBrowserKeys.all,
			]) {
				queryClient.invalidateQueries({ queryKey });
			}

			if (dbType) posthogAnalytics.capture("query_executed", { db_type: dbType });
		},
	});

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
