import { useMutation } from "@tanstack/react-query";
import type { ExecuteQueryResponse } from "server/src/dao/query.dao";
import { API_URL } from "@/utils/constants";

export const useExecuteQuery = () => {
	const { mutateAsync: executeQuery, isPending: isExecutingQuery } = useMutation<
		ExecuteQueryResponse,
		Error,
		{ query: string; page: number; pageSize: number }
	>({
		mutationFn: async ({
			query,
			page,
			pageSize,
		}: {
			query: string;
			page: number;
			pageSize: number;
		}) => {
			const searchParams = new URLSearchParams();
			searchParams.set("page", page.toString());
			searchParams.set("pageSize", pageSize.toString());

			const response = await fetch(`${API_URL}/query?${searchParams.toString()}`, {
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
