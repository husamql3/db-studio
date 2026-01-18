import { useMutation } from "@tanstack/react-query";
import type { ExecuteQueryResponse } from "shared/types";
import { fetcher } from "@/lib/fetcher";
import { useDatabaseStore } from "@/stores/database.store";

export const useExecuteQuery = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResponse, Error, { query: string }>({
		mutationFn: ({ query }) =>
			fetcher.post<ExecuteQueryResponse>(
				"/query",
				{ query },
				{ params: { database: selectedDatabase } },
			),
	});

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
