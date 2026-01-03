import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { getQueryClient } from "@/lib/query-client.ts";
import reportWebVitals from "./reportWebVitals.ts";
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {
		QueryClient,
	},
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Render the app
const rootElement = document.getElementById("root");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	const queryClient = getQueryClient();

	root.render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// import { NuqsAdapter } from "nuqs/adapters/react";
// import { StrictMode } from "react";
// import { createRoot } from "react-dom/client";

// import "@/index.css";
// import { App } from "@/App";
// import { ConnectionChecker } from "@/components/components/connection-checker";
// import { Toaster } from "@/components/ui/sonner";
// import { ReactQueryProvider } from "@/providers/react-query.provider";

// createRoot(document.getElementById("root") as HTMLElement).render(
// 	<StrictMode>
// 		<NuqsAdapter
// 			fullPageNavigationOnShallowFalseUpdates
// 			defaultOptions={{ shallow: true }}
// 		>
// 			<ReactQueryProvider>
// 				<App />
// 			</ReactQueryProvider>
// 		</NuqsAdapter>

// 		<Toaster position="top-center" />
// 		<ConnectionChecker />
// 	</StrictMode>,
// );
