import { useQuery } from "@tanstack/react-query";
import type { RateLimitResponse } from "shared/types";
import { rootApi } from "@/lib/api";

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: ["rate-limit"],
		queryFn: async () => {
			try {
				const res = await rootApi.get<RateLimitResponse>("/chat/limit");
				return res.data;
			} catch {
				return { limit: 0, used: 0, remaining: 0 };
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
