import { useMutation } from "@tanstack/react-query";
import type { BaseResponse, ExecuteQueryResult } from "shared/types";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";

type ExecuteQueryMode = "normal" | "sandbox";

export const useExecuteQuery = (mode: ExecuteQueryMode = "normal") => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const endpoint = mode === "sandbox" ? "/query/sandbox" : "/query";
			const res = await api.post<BaseResponse<ExecuteQueryResult>>(
				endpoint,
				{ query },
				{ params },
			);
			return res.data.data;
		},
	});

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
