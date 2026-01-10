import { useMutation } from "@tanstack/react-query";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { useDatabaseStore } from "@/stores/database.store";
import { API_URL } from "@/utils/constants";

export const useExecuteQuery = () => {
	const { selectedDatabase } = useDatabaseStore();

	const {
		mutateAsync: executeQuery,
		isPending: isExecutingQuery,
		error: executeQueryError,
	} = useMutation<ExecuteQueryResponse, Error, { query: string }>({
		mutationFn: async ({ query }: { query: string }) => {
			const url = new URL(`${API_URL}/query`);
			if (selectedDatabase) {
				url.searchParams.set("database", selectedDatabase);
			}
			const response = await fetch(url.toString(), {
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
