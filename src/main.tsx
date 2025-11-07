import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/index.css";
import App from "@/app";
import { ReactProvider } from "@/providers/react-provider";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<ReactProvider>
			<App />
		</ReactProvider>
	</StrictMode>,
);
