import { useQuery } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { RateLimitResponse } from "shared/types";

const UNLIMITED: RateLimitResponse = { limit: 999, used: 0, remaining: 999 };
const IS_LOCAL = typeof window !== "undefined" && window.location.hostname === "localhost";

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: ["rate-limit"],
		queryFn: async () => {
			if (IS_LOCAL) return UNLIMITED;
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
