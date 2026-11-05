import type { RateLimitResponse } from "@db-studio/shared/types";
import { useByok } from "@tanstack/ai-react";
import { useQuery } from "@tanstack/react-query";
import {
	aiByok,
	HOSTED_AI_PROVIDER,
	useAiByokReady,
	useAiSettingsStore,
} from "@/features/settings";
import { getRateLimit } from "@/shared/api";
import { chatKeys } from "@/shared/query/keys";

/** Whether the assistant can send: with a personal key, or on the hosted provider's quota. */
export const useAiQuota = () => {
	const { provider } = useAiSettingsStore();
	const byok = useByok(aiByok);
	const isByokReady = useAiByokReady();
	const keyStatus = byok.status[provider];
	const hasPersonalKey = keyStatus?.state === "set" || keyStatus?.state === "locked";
	const usesHostedQuota = provider === HOSTED_AI_PROVIDER && !hasPersonalKey;

	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: chatKeys.rateLimit(),
		queryFn: async () => (await getRateLimit()).data,
		enabled: isByokReady && usesHostedQuota,
	});

	const remaining = rateLimit?.remaining ?? 0;

	return {
		provider,
		isByokReady,
		hasPersonalKey,
		usesHostedQuota,
		rateLimit,
		remaining,
		isLoadingRateLimit,
		errorRateLimit,
		refetchRateLimit,
		canSend: hasPersonalKey || (usesHostedQuota && remaining > 0),
	};
};
