import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { Toaster } from "@/components/ui/sonner";
import { ReactQueryProvider } from "@/providers/react-query.provider.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<NuqsAdapter
			fullPageNavigationOnShallowFalseUpdates
			defaultOptions={{ shallow: true }}
		>
			<ReactQueryProvider>
				<App />
			</ReactQueryProvider>
		</NuqsAdapter>
		<Toaster position="top-center" />
	</StrictMode>,
);
