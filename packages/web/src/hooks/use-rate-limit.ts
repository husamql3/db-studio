import type { RateLimitResponse } from "@db-studio/shared/types";
import { useQuery } from "@tanstack/react-query";
import { getRateLimit } from "@/shared/api";
import { chatKeys } from "@/shared/query/keys";

export const useRateLimit = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const {
		data: rateLimit,
		isLoading: isLoadingRateLimit,
		error: errorRateLimit,
		refetch: refetchRateLimit,
	} = useQuery<RateLimitResponse>({
		queryKey: chatKeys.rateLimit(),
		queryFn: async () => (await getRateLimit()).data,
		enabled,
	});

	return {
		rateLimit,
		isLoadingRateLimit,
		errorRateLimit,
		refetchRateLimit,
	};
};
