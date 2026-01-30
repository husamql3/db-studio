import { useMutation } from "@tanstack/react-query";
import type { AnalyzeQueryResult, BaseResponse } from "shared/types";
import { api } from "@/lib/api";
import { useDatabaseStore } from "@/stores/database.store";

export const useAnalyzeQuery = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: analyzeQuery,
		isPending: isAnalyzing,
		error: analyzeError,
	} = useMutation<AnalyzeQueryResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const res = await api.post<BaseResponse<AnalyzeQueryResult>>(
				"/query/analyze",
				{ query },
				{ params },
			);
			return res.data.data;
		},
	});

	return {
		analyzeQuery,
		isAnalyzing,
		analyzeError,
	};
};
