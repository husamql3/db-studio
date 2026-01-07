import { useMutation } from "@tanstack/react-query";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { API_URL } from "@/utils/constants";

export const useExecuteQuery = () => {
	const {
		mutateAsync: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResponse, Error, { query: string }>({
		mutationFn: async ({ query }: { query: string }) => {
			const response = await fetch(`${API_URL}/query`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
			});
			if (!response.ok) {
				const errorData = await response.json();
				console.log("useExecuteQuery errorData:", errorData);
				throw new Error(errorData.error);
			}
			const result = await response.json();
			console.log("useExecuteQuery result:", result);
			return result;
		},
	});

	return {
		executeQuery,
		isExecutingQuery,
		executeQueryError,
	};
};
