import { useMutation } from "@tanstack/react-query";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { API_URL } from "@/utils/constants";

export const useExecuteQuery = () => {
	const { mutateAsync: executeQuery, isPending: isExecutingQuery } = useMutation<
		ExecuteQueryResponse,
		Error,
		string
	>({
		mutationFn: async (query: string) => {
			const response = await fetch(`${API_URL}/query`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
			});
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || "Failed to execute query");
			}
			const result = await response.json();
			return result;
		},
	});

	return {
		executeQuery,
		isExecutingQuery,
	};
};
