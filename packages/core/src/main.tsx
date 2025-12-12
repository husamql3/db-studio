import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/index.css";

import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { ReactProvider } from "@/providers/react-provider";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<ReactProvider>
			<App />
		</ReactProvider>
		<Toaster position="top-center" />
	</StrictMode>,
);
