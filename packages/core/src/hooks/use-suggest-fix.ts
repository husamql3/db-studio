import { useMutation } from "@tanstack/react-query";
import type { BaseResponse, SuggestFixResult } from "shared/types";
import { api } from "@/lib/api";
import { useAiSettingsStore } from "@/stores/ai-settings.store";
import { useDatabaseStore } from "@/stores/database.store";

export const useSuggestFix = () => {
	const { selectedDatabase } = useDatabaseStore();
	const { useByocProxy, byocProxyUrl, provider, model, apiKeys } = useAiSettingsStore();

	const {
		mutateAsync: suggestFix,
		isPending: isSuggestingFix,
		error: suggestFixError,
	} = useMutation<
		SuggestFixResult,
		Error,
		{ query: string; errorMessage: string; errorDetails?: unknown }
	>({
		mutationFn: async ({ query, errorMessage, errorDetails }) => {
			const params = new URLSearchParams({ db: selectedDatabase ?? "" });
			const body = {
				query,
				errorMessage,
				errorDetails,
				proxyUrl: useByocProxy ? byocProxyUrl.trim() : undefined,
				provider,
				model,
				apiKey: apiKeys[provider] || undefined,
			};
			const res = await api.post<BaseResponse<SuggestFixResult>>("/chat/suggest-fix", body, {
				params,
			});
			return res.data.data;
		},
	});

	return {
		suggestFix,
		isSuggestingFix,
		suggestFixError,
	};
};
