import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import { SearchParamsProvider } from "./contexts/search-params-context.tsx";
import { ReactProvider } from "./providers/react-provider.tsx";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<ReactProvider>
			<SearchParamsProvider>
				<App />
			</SearchParamsProvider>
		</ReactProvider>
	</StrictMode>,
);
