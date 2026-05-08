import type { ExecuteQueryResult } from "@db-studio/shared/types";
import { useMutation } from "@tanstack/react-query";
import { executeQuery as executeQueryRequest } from "@/shared/api";
import { useDatabaseStore } from "@/stores/database.store";

export const useExecuteQuery = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const res = await executeQueryRequest({ query, db: selectedDatabase });
			return res.data.data;
		},
	});

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
