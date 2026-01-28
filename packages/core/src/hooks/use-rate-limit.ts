import { useQuery } from "@tanstack/react-query";
import { DEFAULTS } from "shared/constants";
import type { RateLimitResponse } from "shared/types";

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: ["rate-limit"],
		queryFn: async () => {
			const response = await fetch(`${DEFAULTS.PROXY_URL}/chat/limit`);
			if (!response.ok) {
				throw new Error("Failed to fetch rate limit");
			}
			const data = await response.json();
			return data;
		},
	});

	return {
		rateLimit,
		isLoadingRateLimit,
		errorRateLimit,
		refetchRateLimit,
	};
};
