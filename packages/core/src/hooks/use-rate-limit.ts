import { useQuery } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { RateLimitResponse } from "shared/types";

const UNLIMITED: RateLimitResponse = { limit: 999, used: 0, remaining: 999 };

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: ["rate-limit"],
		queryFn: async () => {
			if (DEFAULTS.IS_DEV) return UNLIMITED;
			try {
				const response = await fetch(`${DEFAULTS.PROXY_URL}/chat/limit`);
				if (!response.ok) return UNLIMITED;
				return await response.json();
			} catch {
				return UNLIMITED;
			}
		},
	});

	return {
		rateLimit,
		isLoadingRateLimit,
		errorRateLimit,
		refetchRateLimit,
	};
};
