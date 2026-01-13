import { useQuery } from "@tanstack/react-query";
import type { RateLimitResponse } from "proxy/src/types";
import { PROXY_URL } from "@/utils/constants";

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: ["rate-limit"],
		queryFn: async () => {
			const response = await fetch(`${PROXY_URL}/chat/limit`);
			if (!response.ok) {
				throw new Error("Failed to fetch rate limit");
			}
			const data = await response.json();
			console.log("useRateLimit data:", data);
			return data;
		},
	});

	return { rateLimit, isLoadingRateLimit, errorRateLimit, refetchRateLimit };
};
