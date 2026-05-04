import { useQuery } from "@tanstack/react-query";
import type { RateLimitResponse } from "shared/types";
import { getRateLimit } from "@/shared/api";
import { chatKeys } from "@/shared/query/keys";

export const useRateLimit = () => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: chatKeys.rateLimit(),
		queryFn: async () => {
			try {
				const res = await getRateLimit();
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
