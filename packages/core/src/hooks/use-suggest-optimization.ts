import { useMutation } from "@tanstack/react-query";
import type { BaseResponse, SuggestOptimizationResult } from "shared/types";
import { api } from "@/lib/api";
import { useAiSettingsStore } from "@/stores/ai-settings.store";
import { useDatabaseStore } from "@/stores/database.store";

export const useSuggestOptimization = () => {
	const { selectedDatabase } = useDatabaseStore();
	const { useByocProxy, byocProxyUrl, provider, model, apiKeys } = useAiSettingsStore();

	const {
		mutateAsync: suggestOptimization,
		isPending: isSuggestingOptimization,
		error: suggestOptimizationError,
	} = useMutation<SuggestOptimizationResult, Error, { query: string }>({
		mutationFn: async ({ query }) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const body = {
				query,
				proxyUrl: useByocProxy ? byocProxyUrl.trim() : undefined,
				provider,
				model,
				apiKey: apiKeys[provider] || undefined,
			};
			const res = await api.post<BaseResponse<SuggestOptimizationResult>>(
				"/query/suggest-optimization",
				body,
				{ params },
			);
			return res.data.data;
		},
	});

	return {
		suggestOptimization,
		isSuggestingOptimization,
		suggestOptimizationError,
	};
};
