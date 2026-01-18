import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";

let clientQueryClientSingleton: QueryClient | undefined;

const createQueryClient = () => {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30 * 1000, // 30 seconds
				gcTime: 5 * 60 * 1000, // 5 minutes (was cacheTime)
				retry: 2,
				retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
				refetchOnWindowFocus: false, // refetch on window focus
				refetchOnMount: false, // refetch on mount
				refetchOnReconnect: true, // refetch on reconnect
			},
			mutations: {
				retry: 0,
				// retryDelay: 1000, // retry delay 1 second
				networkMode: "online", // Only run mutations while online
			},

			dehydrate: {
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
		},
	});
};

export const getQueryClient = () => {
	if (typeof window === "undefined") {
		// Server-side: always create a new client
		return createQueryClient();
	}

	// Client-side: use singleton pattern
	if (!clientQueryClientSingleton) {
		clientQueryClientSingleton = createQueryClient();
	}

	return clientQueryClientSingleton;
};
