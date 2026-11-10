import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 1000,
			gcTime: 5 * 60 * 1000,
			retry: 0,
			refetchOnWindowFocus: false,
			refetchOnMount: false,
			refetchOnReconnect: true,
		},
		mutations: {
			retry: 0,
			networkMode: "online",
		},
	},
});
