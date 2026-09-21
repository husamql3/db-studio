import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { useMutation } from "@tanstack/react-query";
import { posthogAnalytics } from "@/lib/posthog";
import { executeQuery as executeQueryRequest } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";

export const useExecuteQuery = () => {
	const { selectedDatabase, dbType } = useDatabaseStore();

	const {
		mutateAsync: executeQueryMutation,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const res = await executeQueryRequest({ query, db: selectedDatabase });
			return res.data.data;
		},
		onSuccess: () => {
			if (dbType) posthogAnalytics.capture("query_executed", { db_type: dbType });
		},
	});
	const executeQuery = async ({ query }: { query: string }) => {
		try {
			return await executeQueryMutation({ query });
		} catch {
			return undefined;
		}
	};

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
